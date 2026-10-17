import { ErrorBoundary } from "@/components/ErrorBoundary";
import { track } from "@/lib/telemetry";

jest.mock("@/lib/telemetry", () => ({ track: jest.fn() }));
jest.mock("@/components/ErrorFallback", () => ({ ErrorFallback: () => null }));

describe("ErrorBoundary recovery", () => {
  it("renders the fallback and exposes a reset that returns to the child", () => {
    const error = new Error("render failed");
    const Fallback = () => null;
    const boundary = new ErrorBoundary({
      children: "journey",
      FallbackComponent: Fallback,
    });

    boundary.state = ErrorBoundary.getDerivedStateFromError(error);
    const fallback = boundary.render() as React.ReactElement;
    expect(fallback.type).toBe(Fallback);
    expect(fallback.props.error).toBe(error);
    expect(fallback.props.resetError).toBe(boundary.resetError);

    boundary.state = { error: null };
    expect(boundary.render()).toBe("journey");
  });

  it("records only the aggregate event and invokes an optional local hook", () => {
    const onError = jest.fn();
    const boundary = new ErrorBoundary({ children: null, onError });
    const error = new Error("private render detail");

    boundary.componentDidCatch(error, { componentStack: "private stack" });

    expect(track).toHaveBeenCalledWith("client_error");
    expect(track).not.toHaveBeenCalledWith(
      "client_error",
      expect.objectContaining({ error: expect.anything() }),
    );
    expect(onError).toHaveBeenCalledWith(error, "private stack");
  });
});
