<script lang="ts">
  type Props = {
    email: string | null;
    syncEnabled: boolean;
    busy: boolean;
    error: string | null;
    onSignIn: (email: string, password: string) => Promise<void>;
    onSignUp: (email: string, password: string) => Promise<void>;
    onSignOut: () => Promise<void>;
    onDeleteAccount: (password: string) => Promise<void>;
    onSyncChange: (enabled: boolean) => void;
  };

  let {
    email,
    syncEnabled,
    busy,
    error,
    onSignIn,
    onSignUp,
    onSignOut,
    onDeleteAccount,
    onSyncChange,
  }: Props = $props();

  // Exact wording from the design spec: honest about server-side encryption and
  // the operator's access, and explicit that sync is opt-in.
  const PRIVACY_TEXT =
    "Фотографии не покидают устройство. Названия файлов и категории сохраняются на сервере в зашифрованном виде; оператор сервера имеет к ним доступ. Синхронизация выключена, пока вы не включите её сами.";

  const inputClass =
    "w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none transition focus-visible:border-accent-line focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60";

  type Mode = "sign-in" | "sign-up";

  let mode = $state<Mode>("sign-in");
  let inputEmail = $state("");
  let password = $state("");

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const name = inputEmail.trim();

    if (busy || name === "" || password === "") {
      return;
    }

    const action = mode === "sign-in" ? onSignIn : onSignUp;

    await action(name, password);
    password = "";
  }
</script>

<section class="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-sm font-semibold text-ink">Аккаунт</h2>
    {#if email !== null}
      <span class="max-w-full truncate text-xs text-ink-muted" title={email}>{email}</span>
    {:else}
      <span class="text-xs text-ink-muted">без аккаунта — всё хранится только в браузере</span>
    {/if}
  </div>

  {#if email === null}
    <div class="flex gap-2" role="group" aria-label="Режим входа">
      <button
        type="button"
        onclick={() => (mode = "sign-in")}
        class={[
          "rounded-lg px-3 py-1.5 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-focus",
          mode === "sign-in" ? "bg-accent text-on-accent" : "text-ink-muted hover:text-ink",
        ]}
      >
        Вход
      </button>
      <button
        type="button"
        onclick={() => (mode = "sign-up")}
        class={[
          "rounded-lg px-3 py-1.5 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-focus",
          mode === "sign-up" ? "bg-accent text-on-accent" : "text-ink-muted hover:text-ink",
        ]}
      >
        Регистрация
      </button>
    </div>

    <form class="flex flex-col gap-2" onsubmit={submit}>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-ink-muted">Email</span>
        <input
          type="email"
          autocomplete="email"
          bind:value={inputEmail}
          class={inputClass}
          disabled={busy}
          required
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-ink-muted">Пароль</span>
        <input
          type="password"
          autocomplete={mode === "sign-in" ? "current-password" : "new-password"}
          bind:value={password}
          class={inputClass}
          disabled={busy}
          required
        />
      </label>
      <button
        type="submit"
        class="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition outline-none hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy}
      >
        {mode === "sign-in" ? "Войти" : "Создать аккаунт"}
      </button>
    </form>
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
      <span class="text-sm font-medium text-ink">Вы вошли</span>
      <button
        type="button"
        onclick={onSignOut}
        class="rounded-lg border border-line px-3 py-1.5 text-sm text-ink transition outline-none hover:border-accent-line focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy}
      >
        Выйти
      </button>
    </div>

    <details class="rounded-lg border border-line p-3 text-xs">
      <summary
        class="cursor-pointer text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Удалить аккаунт и данные на сервере
      </summary>
      <p class="mt-2 text-ink-muted">
        Локальная история останется на этом устройстве. Для подтверждения введите пароль.
      </p>
      <form
        class="mt-2 flex flex-col gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          if (password) {
            void onDeleteAccount(password);
          }
        }}
      >
        <input
          type="password"
          bind:value={password}
          placeholder="Пароль"
          aria-label="Пароль для удаления аккаунта"
          class={inputClass}
          disabled={busy}
        />
        <button
          type="submit"
          class="rounded-lg bg-danger px-3 py-1.5 font-medium text-on-accent outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
          disabled={busy || password === ""}
        >
          Удалить безвозвратно
        </button>
      </form>
    </details>

    <label class="flex cursor-pointer items-start gap-3 rounded-lg bg-accent-soft p-3">
      <input
        type="checkbox"
        checked={syncEnabled}
        onchange={(event) => onSyncChange(event.currentTarget.checked)}
        class="mt-0.5 size-4 shrink-0 accent-accent"
      />
      <span class="flex flex-col gap-1">
        <span class="text-sm font-medium text-ink">Синхронизировать метаданные</span>
        <span class="text-xs text-ink-muted">{PRIVACY_TEXT}</span>
      </span>
    </label>
  {/if}

  {#if error !== null}
    <p class="rounded-lg bg-danger-soft p-3 text-sm text-danger" role="alert">{error}</p>
  {/if}
</section>
