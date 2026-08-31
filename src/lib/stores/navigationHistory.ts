export type NavigationAvailability = {
  canGoBack: boolean;
  canGoForward: boolean;
};

export function createNavigationHistory() {
  let backStack: string[] = [];
  let forwardStack: string[] = [];

  function availability(): NavigationAvailability {
    return {
      canGoBack: backStack.length > 0,
      canGoForward: forwardStack.length > 0,
    };
  }

  return {
    availability,
    clear() {
      backStack = [];
      forwardStack = [];
    },
    record(previousPath: string | null, nextPath: string) {
      if (!previousPath || previousPath === nextPath) {
        return availability();
      }

      backStack = [...backStack, previousPath];
      forwardStack = [];
      return availability();
    },
    async goBack(
      currentPath: string | null,
      navigate: (targetPath: string) => Promise<boolean>,
    ) {
      const targetPath = backStack.at(-1);
      if (!targetPath || !currentPath || !(await navigate(targetPath))) {
        return false;
      }

      backStack = backStack.slice(0, -1);
      forwardStack = [...forwardStack, currentPath];
      return true;
    },
    async goForward(
      currentPath: string | null,
      navigate: (targetPath: string) => Promise<boolean>,
    ) {
      const targetPath = forwardStack.at(-1);
      if (!targetPath || !currentPath || !(await navigate(targetPath))) {
        return false;
      }

      forwardStack = forwardStack.slice(0, -1);
      backStack = [...backStack, currentPath];
      return true;
    },
  };
}
