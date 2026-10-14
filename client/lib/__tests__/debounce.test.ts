import { createTrailingDebounce } from "@/lib/debounce";

describe("createTrailingDebounce", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("collapses a burst into one trailing run with the latest argument", () => {
    const run = jest.fn();
    const debounce = createTrailingDebounce(run, 1500);
    debounce.schedule(1);
    jest.advanceTimersByTime(1000);
    debounce.schedule(2);
    jest.advanceTimersByTime(1000);
    debounce.schedule(3);
    expect(run).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1499);
    expect(run).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(3);
  });

  it("flush runs the latest pending argument once and clears the timer", () => {
    const run = jest.fn();
    const debounce = createTrailingDebounce(run, 1500);
    debounce.schedule("a");
    debounce.schedule("b");
    debounce.flush();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("b");
    jest.advanceTimersByTime(5000);
    debounce.flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending argument", () => {
    const run = jest.fn();
    const debounce = createTrailingDebounce(run, 1500);
    debounce.schedule("a");
    debounce.cancel();
    jest.advanceTimersByTime(5000);
    debounce.flush();
    expect(run).not.toHaveBeenCalled();
  });
});
