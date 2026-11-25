import type { SyncController } from "../sync/controller";
import {
  SESSION_COOKIE,
  messageOf,
  type AppAccountSnapshot,
  type AuthClientLike,
  type AuthResult,
} from "./types";

type SessionRead = { checked: false } | { checked: true; email: string | null };

type AuthFlowParams = {
  authClient: AuthClientLike;
  cookie: () => string;
  storage: Pick<Storage, "getItem" | "setItem">;
  account: AppAccountSnapshot;
  emit: () => void;
  isStopped: () => boolean;
  startSyncIfEnabled: () => Promise<void>;
  getSync: () => SyncController | null;
  syncPrefKey: string;
};

/**
 * Auth and session side effects. The guest gate lives here so neither route
 * can trigger an auth request without the readable session hint cookie.
 */
export function createAuthFlow(params: AuthFlowParams) {
  const {
    authClient,
    cookie,
    storage,
    account,
    emit,
    isStopped,
    startSyncIfEnabled,
    getSync,
    syncPrefKey,
  } = params;

  // One session lookup per controller lifetime, reset when auth state changes.
  let sessionLookup: Promise<SessionRead> | null = null;

  // Shared gate for the two session reads: a guest without the cookie must
  // never produce an auth request, whatever route asked for the session.
  async function readSession(): Promise<SessionRead> {
    if (!cookie().includes(SESSION_COOKIE)) {
      return { checked: false };
    }

    const { data } = await authClient.getSession();
    return { checked: true, email: data?.user?.email ?? null };
  }

  function readSessionOnce(): Promise<SessionRead> {
    sessionLookup ??= readSession();
    return sessionLookup;
  }

  function resetSessionLookup(): void {
    sessionLookup = null;
  }

  // Used by the sign-in route only; it must not change the sync preference or
  // start sync, and it stays silent for guests.
  async function checkSession(): Promise<void> {
    if (isStopped()) {
      return;
    }

    const session = await readSessionOnce();

    if (!session.checked) {
      return;
    }
    account.email = session.email;
    emit();
  }

  async function runAuth(action: () => Promise<AuthResult>, failureMessage: string): Promise<void> {
    account.busy = true;
    account.error = null;
    emit();

    try {
      const result = await action();

      if (result.error) {
        account.error = result.error.message ?? failureMessage;
        return;
      }
      // A guest lookup cached before sign-in must not shadow the new session.
      resetSessionLookup();
      account.email = result.data?.user?.email ?? null;
      await startSyncIfEnabled();
    } catch (error) {
      account.error = messageOf(error);
    } finally {
      account.busy = false;
      emit();
    }
  }

  function signIn(email: string, password: string): Promise<void> {
    return runAuth(() => authClient.signIn.email({ email, password }), "Failed to sign in.");
  }

  function signUp(email: string, password: string): Promise<void> {
    return runAuth(
      () =>
        authClient.signUp.email({
          email,
          password,
          name: email.split("@")[0] ?? "user",
        }),
      "Failed to create an account.",
    );
  }

  async function signOut(): Promise<void> {
    account.busy = true;
    account.error = null;
    emit();

    try {
      await authClient.signOut();
    } catch (error) {
      account.error = messageOf(error);
    } finally {
      account.busy = false;
      emit();
    }

    account.email = null;
    account.syncEnabled = false;
    resetSessionLookup();
    storage.setItem(syncPrefKey, "false");
    await getSync()?.stop();
    emit();
  }

  async function deleteAccount(password: string): Promise<void> {
    account.busy = true;
    account.error = null;
    emit();

    try {
      const result = await authClient.deleteUser({ password });

      if (result.error) {
        account.error = result.error.message ?? "Failed to delete account.";
        return;
      }

      account.email = null;
      account.syncEnabled = false;
      resetSessionLookup();
      storage.setItem(syncPrefKey, "false");
      await getSync()?.stop();
    } catch (error) {
      account.error = messageOf(error);
    } finally {
      account.busy = false;
      emit();
    }
  }

  return {
    readSessionOnce,
    resetSessionLookup,
    checkSession,
    signIn,
    signUp,
    signOut,
    deleteAccount,
  };
}
