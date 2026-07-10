import { createTextStreamBuffer } from "@/lib/stream-buffer";

describe("createTextStreamBuffer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("coalesces rapid chunks into one update", () => {
    const flush = jest.fn();
    const buffer = createTextStreamBuffer(flush, 50);

    buffer.append("Hel");
    buffer.append("lo");
    jest.advanceTimersByTime(49);
    expect(flush).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith("Hello");
  });

  it("flushes final text immediately", () => {
    const flush = jest.fn();
    const buffer = createTextStreamBuffer(flush, 50);

    buffer.append("final");
    buffer.flush();

    expect(flush).toHaveBeenCalledWith("final");
    jest.advanceTimersByTime(50);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("drops buffered text after cancellation", () => {
    const flush = jest.fn();
    const buffer = createTextStreamBuffer(flush, 50);

    buffer.append("discard");
    buffer.cancel();
    buffer.flush();
    jest.advanceTimersByTime(50);

    expect(flush).not.toHaveBeenCalled();
  });
});
