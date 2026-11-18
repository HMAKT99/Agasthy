import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { dismissUpdate, isDismissed, isNetworkError, useUpdateState } from "./updates";

describe("isNetworkError", () => {
  it("stays quiet for connection problems", () => {
    for (const m of [
      "error sending request for url (https://github.com/HMAKT99/Agasthy/releases/latest/download/latest.json)",
      "dns error: failed to lookup address information",
      "operation timed out",
      "Could not fetch a valid release JSON from the remote",
      "connection refused",
    ])
      expect(isNetworkError(m), m).toBe(true);
  });

  it("speaks up when this copy cannot update itself", () => {
    for (const m of [
      // The app's own files are gone (a deleted build folder).
      "No such file or directory (os error 2)",
      "Permission denied (os error 13)",
      "Read-only file system (os error 30)",
    ])
      expect(isNetworkError(m), m).toBe(false);
  });
});

describe("dismissUpdate", () => {
  it("re-renders whoever shows the banner, so Later hides it", () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useUpdateState();
    });
    const before = renders;
    expect(isDismissed()).toBe(false);
    act(() => dismissUpdate());
    expect(isDismissed()).toBe(true);
    expect(renders).toBeGreaterThan(before);
  });
});
