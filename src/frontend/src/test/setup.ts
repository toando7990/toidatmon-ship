// Shared Vitest setup for the frontend suite.
// Configures Testing Library to use the app's `data-ocid` attribute as the
// test id, and registers jest-dom matchers.

import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { vi } from "vitest";

configure({ testIdAttribute: "data-ocid" });

// The generated @/backend wrapper re-exports ExternalBlob from
// @caffeineai/object-storage, whose dist/index.js imports a "./dist/blob"
// subpath that Vitest cannot resolve. Mock the package so importing @/backend
// (for Order/PaymentStatus types) works in the jsdom test environment.
vi.mock("@caffeineai/object-storage", () => ({
  ExternalBlob: class ExternalBlob {},
}));
