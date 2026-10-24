import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTransientMessage } from "./useTransientMessage";

describe("useTransientMessage", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("clears the message after six seconds", () => {
    const { result } = renderHook(() => useTransientMessage());
    act(() => result.current[1]("Added 2 new opportunities."));
    expect(result.current[0]).toBe("Added 2 new opportunities.");
    act(() => void vi.advanceTimersByTime(5900));
    expect(result.current[0]).not.toBeNull();
    act(() => void vi.advanceTimersByTime(200));
    expect(result.current[0]).toBeNull();
  });

  it("restarts the timer for a new message", () => {
    const { result } = renderHook(() => useTransientMessage());
    act(() => result.current[1]("First."));
    act(() => void vi.advanceTimersByTime(4000));
    act(() => result.current[1]("Second."));
    act(() => void vi.advanceTimersByTime(4000));
    expect(result.current[0]).toBe("Second.");
    act(() => void vi.advanceTimersByTime(2100));
    expect(result.current[0]).toBeNull();
  });

  it("cancels the timer on unmount", () => {
    const { result, unmount } = renderHook(() => useTransientMessage());
    act(() => result.current[1]("Bye."));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
