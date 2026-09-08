import { GoogleAuth, OAuth2Client } from "google-auth-library";

const ANDROID_PUBLISHER_SCOPE =
  "https://www.googleapis.com/auth/androidpublisher";
const ACTIVE_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_CANCELED",
]);

export type GooglePlan = "monthly" | "yearly";

interface GoogleSubscriptionLineItem {
  productId?: string;
  expiryTime?: string;
  latestSuccessfulOrderId?: string;
  offerDetails?: { basePlanId?: string; offerId?: string };
}

export interface GoogleSubscriptionPurchaseV2 {
  subscriptionState?: string;
  acknowledgementState?: string;
  lineItems?: GoogleSubscriptionLineItem[];
  linkedPurchaseToken?: string;
}

export interface GoogleSubscriptionValidation {
  valid: boolean;
  plan: GooglePlan | null;
  productId: string | null;
  basePlanId: string | null;
  expiresDate: Date | null;
  orderId: string | null;
  acknowledgementPending: boolean;
  subscriptionState: string | null;
}

function planFromLineItem(
  lineItem: GoogleSubscriptionLineItem | undefined,
): GooglePlan | null {
  const value =
    `${lineItem?.offerDetails?.basePlanId ?? ""} ${lineItem?.productId ?? ""}`.toLowerCase();
  if (value.includes("year") || value.includes("annual")) return "yearly";
  if (value.includes("month")) return "monthly";
  return null;
}

export function parseGoogleSubscription(
  purchase: GoogleSubscriptionPurchaseV2,
  now: Date = new Date(),
): GoogleSubscriptionValidation {
  const lineItem = [...(purchase.lineItems ?? [])].sort((a, b) =>
    (b.expiryTime ?? "").localeCompare(a.expiryTime ?? ""),
  )[0];
  const expiresDate = lineItem?.expiryTime
    ? new Date(lineItem.expiryTime)
    : null;
  const state = purchase.subscriptionState ?? null;
  const productId = lineItem?.productId ?? null;
  const recognizedProduct =
    productId === "premium" ||
    productId === "premium_monthly" ||
    productId === "premium_yearly";
  const valid =
    recognizedProduct &&
    !!state &&
    ACTIVE_STATES.has(state) &&
    !!expiresDate &&
    !Number.isNaN(expiresDate.getTime()) &&
    expiresDate.getTime() > now.getTime();

  return {
    valid,
    plan: planFromLineItem(lineItem),
    productId,
    basePlanId: lineItem?.offerDetails?.basePlanId ?? null,
    expiresDate,
    orderId: lineItem?.latestSuccessfulOrderId ?? null,
    acknowledgementPending:
      purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING",
    subscriptionState: state,
  };
}

function credentials(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not configured");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function publisherClient() {
  const auth = new GoogleAuth({
    credentials: credentials(),
    scopes: [ANDROID_PUBLISHER_SCOPE],
  });
  return auth.getClient();
}

export async function validateGoogleSubscription(
  purchaseToken: string,
): Promise<GoogleSubscriptionValidation> {
  if (!purchaseToken) throw new Error("Google purchase token is required");
  const packageName =
    process.env.ANDROID_PACKAGE_NAME || "com.resolutioncompanion.app";
  const client = await publisherClient();
  const encodedToken = encodeURIComponent(purchaseToken);
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${encodedToken}`;
  const response = await client.request<GoogleSubscriptionPurchaseV2>({ url });
  const validation = parseGoogleSubscription(response.data);

  if (
    validation.valid &&
    validation.acknowledgementPending &&
    validation.productId
  ) {
    const subscriptionId = encodeURIComponent(validation.productId);
    await client.request({
      method: "POST",
      url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${subscriptionId}/tokens/${encodedToken}:acknowledge`,
      data: {},
    });
  }

  return validation;
}

export async function verifyGooglePubSubPush(
  authorizationHeader: string | undefined,
): Promise<boolean> {
  const audience = process.env.GOOGLE_PUBSUB_PUSH_AUDIENCE;
  const expectedEmail = process.env.GOOGLE_PUBSUB_PUSH_SERVICE_ACCOUNT_EMAIL;
  if (!audience || !expectedEmail) {
    throw new Error("Google Pub/Sub push authentication is not configured");
  }
  const token = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;

  const ticket = await new OAuth2Client().verifyIdToken({
    idToken: token,
    audience,
  });
  const payload = ticket.getPayload();
  return (
    !!payload &&
    payload.email === expectedEmail &&
    payload.email_verified === true &&
    payload.iss === "https://accounts.google.com"
  );
}
