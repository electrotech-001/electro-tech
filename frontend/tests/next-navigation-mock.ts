import { vi } from "vitest";

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

let currentPathname = "/admin";
let currentSearchParams = new URLSearchParams();
let currentParams: Record<string, string> = {};

export function setMockPathname(path: string) {
  currentPathname = path;
}

export function setMockSearchParams(params: Record<string, string> | URLSearchParams) {
  currentSearchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params);
}

export function setMockParams(params: Record<string, string>) {
  currentParams = params;
}

export function resetMockNavigation() {
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
  mockRouter.back.mockReset();
  mockRouter.forward.mockReset();
  mockRouter.refresh.mockReset();
  mockRouter.prefetch.mockReset();
  currentPathname = "/admin";
  currentSearchParams = new URLSearchParams();
  currentParams = {};
}

export const useRouter = () => mockRouter;
export const usePathname = () => currentPathname;
export const useSearchParams = () => currentSearchParams;
export const useParams = () => currentParams;
