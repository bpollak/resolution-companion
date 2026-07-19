import { startTextTypewriter, TYPEWRITER_DELAY_MS } from "@/lib/typewriter";

describe("startTextTypewriter", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reveals one character at the shared onboarding pace", () => {
    const update = jest.fn();
    const complete = jest.fn();

    startTextTypewriter("Coach", update, complete);

    jest.advanceTimersByTime(TYPEWRITER_DELAY_MS);
    expect(update).toHaveBeenLastCalledWith("C");
    jest.advanceTimersByTime(TYPEWRITER_DELAY_MS * 4);
    expect(update).toHaveBeenLastCalledWith("Coach");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("stops without completing after cancellation", () => {
    const update = jest.fn();
    const complete = jest.fn();
    const stream = startTextTypewriter("Coach", update, complete);

    jest.advanceTimersByTime(TYPEWRITER_DELAY_MS);
    stream.cancel();
    jest.runAllTimers();

    expect(update).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
  });
});
