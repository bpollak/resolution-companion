import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Persona } from "@/lib/storage";

const WITNESS_KEY = "witness_accountability";

export interface WitnessSettings {
  name: string;
  enabled: boolean;
}

export async function getWitnessSettings(): Promise<WitnessSettings> {
  const raw = await AsyncStorage.getItem(WITNESS_KEY);
  if (!raw) return { name: "", enabled: false };
  try {
    const parsed = JSON.parse(raw) as Partial<WitnessSettings>;
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    return { name, enabled: parsed.enabled === true && name.length > 0 };
  } catch {
    return { name: "", enabled: false };
  }
}

export async function setWitnessSettings(
  settings: WitnessSettings,
): Promise<WitnessSettings> {
  const clean = {
    name: settings.name.trim().slice(0, 60),
    enabled: settings.enabled && settings.name.trim().length > 0,
  };
  await AsyncStorage.setItem(WITNESS_KEY, JSON.stringify(clean));
  return clean;
}

export function buildWitnessCelebration(
  witnessName: string,
  persona: Persona | null,
  votesCast: number,
  consistency: number,
): string {
  const identity = persona?.name ?? "the person I'm becoming";
  const greeting = witnessName.trim() ? `Hi ${witnessName.trim()} — ` : "";
  const voteWord = votesCast === 1 ? "vote" : "votes";
  return `${greeting}a small celebration from Resolution Companion: I cast ${votesCast} ${voteWord} for ${identity} this week (${consistency}% consistency). No fixing needed — I just wanted someone in my corner to witness the progress.`;
}
