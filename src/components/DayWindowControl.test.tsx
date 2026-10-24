import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DayWindowControl } from "./DayWindowControl";

describe("DayWindowControl", () => {
  it("shows the window and disables options that would break it", () => {
    render(<DayWindowControl value={{ start: 6, end: 23 }} onChange={() => {}} />);
    expect(screen.getByLabelText("My day starts")).toHaveValue("6");
    expect(screen.getByLabelText("My day ends")).toHaveValue("23");
    const earlyEnd = within(screen.getByLabelText("My day ends")).getByRole("option", {
      name: "9:00 AM",
    }) as HTMLOptionElement;
    expect(earlyEnd.disabled).toBe(true);
  });
  it("reports a valid change", () => {
    const onChange = vi.fn();
    render(<DayWindowControl value={{ start: 6, end: 23 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("My day ends"), { target: { value: "22" } });
    expect(onChange).toHaveBeenCalledWith({ start: 6, end: 22 });
  });
});
