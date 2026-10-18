"use client";

/**
 * Radwa Gulf and Co — application shell.
 *
 * Persistent left navigation, product identity, breadcrumbs, global search,
 * simulated notifications, the demo role switcher and the user menu.
 *
 */

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  LogOut,
  Menu,
  RotateCcw,
  Search,
  UserCog,
  X,
} from "lucide-react";

import { brand } from "@/lib/brand";
import { ROLE_LABELS, ROLE_SHORT_LABELS, DEPARTMENT_LABELS } from "@/domain/enums";

import { timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useRepository } from "@/services/mock/mockRepository";
import {
  useActingUser,
  useActiveRole,
  useDb,
  useDemoStore,
} from "@/store/useDemoStore";
import { notificationsForRole, unreadNotificationCount } from "@/store/selectors";
import { Avatar, Badge, Breadcrumbs, EmptyState } from "@/components/ui/primitives";
import { SyncIndicator } from "./SyncIndicator";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/form";
import { NAV_GROUPS, canRoleAccess, isNavItemActive, navItemForPath } from "./navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <div className="min-h-dvh">

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="no-print sticky top-0 hidden h-dvh w-(--app-sidebar-width) shrink-0 flex-col border-r border-ink-200 bg-white lg:flex">
          <SidebarContent />
        </aside>

        {/* Mobile drawer */}
        {mobileNavOpen ? (
          <div className="no-print fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-ink-900/40" onClick={() => setMobileNavOpen(false)} aria-hidden />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-ink-200 bg-white shadow-overlay">
              <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
                <span className="text-xs font-semibold text-ink-600">Navigation</span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close navigation"
                  className="inline-flex size-7 items-center justify-center rounded-control text-ink-500 hover:bg-ink-100"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenNav={() => setMobileNavOpen(true)} />
          <main className="min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-5">{children}</main>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- sidebar --- */

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const db = useDb();
  const role = useActiveRole();
  const actingUserId = useDemoStore((s) => s.actingUserId);

  return (
    <>
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="block border-b border-ink-200 px-4 py-3.5 transition-colors hover:bg-ink-50"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand
            vector served from /public; next/image would need SVG optimisation
            enabled for no benefit on a fixed-size logo. */}
        <img
          src={brand.logo.src}
          alt={brand.logo.alt}
          width={brand.logo.width}
          height={brand.logo.height}
          className="h-9 w-auto"
        />
        <span className="mt-2 block text-2xs leading-tight text-ink-500">{brand.tagline}</span>
      </Link>

      <nav className="thin-scroll flex-1 overflow-y-auto px-2 py-3" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter(
            (item) => canRoleAccess(item, role) && !item.hiddenInSidebar,
          );
          if (visible.length === 0) return null;

          return (
            <div key={group.label} className="mb-4 last:mb-0">
              <p className="mb-1 px-2 text-2xs font-semibold tracking-wider text-ink-400 uppercase">{group.label}</p>
              <ul className="space-y-0.5">
                {visible.map((item) => {
                  const active = isNavItemActive(pathname, item);
                  const count = item.badge?.(db, role, actingUserId) ?? 0;
                  const primary = item.primaryFor?.includes(role);
                  const Icon = item.icon;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-control px-2 py-1.5 text-xs transition-colors",
                          active
                            ? "bg-brand-600 font-semibold text-white"
                            : primary
                              ? "font-medium text-ink-800 hover:bg-brand-50"
                              : "text-ink-600 hover:bg-ink-100 hover:text-ink-800",
                        )}
                      >
                        <Icon
                          className={cn("size-4 shrink-0", active ? "text-white" : primary ? "text-brand-600" : "text-ink-400")}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {count > 0 ? (
                          <span
                            className={cn(
                              "numeric inline-flex min-w-5 shrink-0 justify-center rounded-full px-1.5 py-0.5 text-2xs font-semibold",
                              active ? "bg-white/20 text-white" : "bg-ink-200 text-ink-700",
                            )}
                          >
                            {count}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-ink-200 p-3">
        <p className="text-2xs leading-relaxed text-ink-500">
          Items highlighted in blue are the primary destinations for{" "}
          <span className="font-medium text-ink-700">{ROLE_LABELS[role]}</span>.
        </p>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- topbar --- */

function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const pathname = usePathname();
  const role = useActiveRole();
  const navItem = navItemForPath(pathname);
  // A detail page inherits its section label. For a role with no access to
  // that section, naming it would advertise a page they cannot open.
  const title =
    navItem && !canRoleAccess(navItem, role)
      ? "Enquiry"
      : (navItem?.label ?? brand.companyName);

  const crumbs = React.useMemo(() => {
    const items: Array<{ label: string; href?: string }> = [{ label: brand.shortName, href: "/dashboard" }];
    const group = NAV_GROUPS.find((g) => g.items.some((i) => i.href === navItem?.href));
    if (group) items.push({ label: group.label });
    // Do not link a crumb this role cannot open — show the label only, so the
    // trail still reads correctly without offering a dead end.
    if (navItem) {
      items.push({
        label: navItem.label,
        href: canRoleAccess(navItem, role) ? navItem.href : undefined,
      });
    }
    if (navItem && pathname !== navItem.href) items.push({ label: "Detail" });
    return items;
  }, [navItem, pathname, role]);

  return (
    <header className="no-print sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="flex h-(--app-header-height) items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-control border border-ink-300 text-ink-600 hover:bg-ink-50 lg:hidden"
        >
          <Menu className="size-4" aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <Breadcrumbs items={crumbs} />
          <h1 className="truncate text-sm font-semibold text-ink-900">{title}</h1>
        </div>

        <GlobalSearch />
        <SyncIndicator />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

/* -------------------------------------------------------- global search --- */

function GlobalSearch() {
  const db = useDb();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useOnClickOutside(containerRef, () => setOpen(false));

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return db.enquiries
      .map((enquiry) => ({
        enquiry,
        client: db.clients.find((c) => c.id === enquiry.clientId),
      }))
      .filter(
        ({ enquiry, client }) =>
          enquiry.reference.toLowerCase().includes(q) ||
          enquiry.projectTitle.toLowerCase().includes(q) ||
          (client?.name.toLowerCase().includes(q) ?? false) ||
          enquiry.projectLocation.toLowerCase().includes(q),
      )
      .slice(0, 7);
  }, [db.enquiries, db.clients, query]);

  return (
    <div ref={containerRef} className="relative hidden sm:block">
      <label htmlFor="global-search" className="sr-only">
        Search enquiries
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-400" aria-hidden />
      <Input
        id="global-search"
        value={query}
        placeholder="Search enquiries…"
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && results[0]) {
            router.push(`/enquiries/${results[0].enquiry.id}`);
            setOpen(false);
            setQuery("");
          }
        }}
        className="h-8 w-44 pl-8 text-xs lg:w-64"
      />

      {open && query.trim().length >= 2 ? (
        <div className="absolute top-full right-0 mt-1 w-80 overflow-hidden rounded-card border border-ink-200 bg-white shadow-overlay">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-ink-500">
              No enquiry matches “{query.trim()}”.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {results.map(({ enquiry, client }) => (
                <li key={enquiry.id}>
                  <Link
                    href={`/enquiries/${enquiry.id}`}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    className="block px-3 py-2 transition-colors hover:bg-brand-50"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="numeric text-2xs font-semibold text-brand-700">{enquiry.reference}</span>
                      <span className="text-2xs text-ink-500">{client?.shortName}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-700">{enquiry.projectTitle}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------- notifications - */

function NotificationBell() {
  const db = useDb();
  const role = useActiveRole();
  const repo = useRepository();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useOnClickOutside(containerRef, () => setOpen(false));

  const items = notificationsForRole(db, role).slice(0, 12);
  const unread = unreadNotificationCount(db, role);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        className="relative inline-flex size-8 items-center justify-center rounded-control border border-ink-300 text-ink-600 transition-colors hover:bg-ink-50"
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 ? (
          <span className="numeric absolute -top-1.5 -right-1.5 inline-flex min-w-4 justify-center rounded-full bg-bad-600 px-1 text-2xs font-semibold text-white">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute top-full right-0 mt-1 w-80 overflow-hidden rounded-card border border-ink-200 bg-white shadow-overlay">
          <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
            <span className="text-xs font-semibold text-ink-800">Notifications — {ROLE_LABELS[role]}</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void repo.markNotificationsRead(role)}
                className="inline-flex items-center gap-1 text-2xs font-medium text-brand-600 hover:underline"
              >
                <CheckCheck className="size-3" aria-hidden />
                Mark all read
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <EmptyState
              title="Nothing for this role"
              description="Switch role or perform a workflow action to generate simulated notifications."
              className="py-6"
            />
          ) : (
            <ul className="thin-scroll max-h-80 divide-y divide-ink-100 overflow-y-auto">
              {items.map((item) => {
                const body = (
                  <>
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-ink-800">{item.title}</span>
                      {!item.read ? <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand-600" aria-label="Unread" /> : null}
                    </span>
                    <span className="mt-0.5 block text-2xs leading-relaxed text-ink-600">{item.body}</span>
                    <span className="mt-1 block text-2xs text-ink-400">{timeAgo(item.at)}</span>
                  </>
                );
                return (
                  <li key={item.id} className={cn(!item.read && "bg-brand-50/40")}>
                    {item.href ? (
                      <Link href={item.href} onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-brand-50">
                        {body}
                      </Link>
                    ) : (
                      <div className="px-3 py-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-ink-200 bg-ink-50 px-3 py-1.5 text-2xs text-ink-500">
            Simulated notifications. This demo sends no email.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- role switcher -- */
/* ------------------------------------------------------------ user menu --- */

/**
 * The signed-in user, with the two things you need mid-demo: switching to
 * another person, and clearing the records.
 *
 * "Switch user" goes back to the sign-in screen, where one click on any demo
 * account signs you straight in — that is the fast path through a multi-role
 * walkthrough.
 */
function UserMenu() {
  const role = useActiveRole();
  const actingUser = useActingUser();
  const signOut = useDemoStore((s) => s.signOut);
  const resetDemo = useDemoStore((s) => s.resetDemo);
  const toast = useToast();
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useOnClickOutside(containerRef, () => setOpen(false));

  async function leaveForSignIn() {
    setOpen(false);
    await signOut();
    router.replace("/login");
  }

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="inline-flex h-8 items-center gap-2 rounded-control border border-ink-300 bg-white pr-2 pl-1.5 text-xs transition-colors hover:bg-ink-50"
        >
          <Avatar initials={actingUser.initials} className="size-6" />
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-36 truncate leading-tight font-medium text-ink-800">
              {actingUser.name}
            </span>
            <span className="block leading-tight text-2xs text-ink-500">{ROLE_SHORT_LABELS[role]}</span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-ink-400" aria-hidden />
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute top-full right-0 mt-1 w-72 overflow-hidden rounded-card border border-ink-200 bg-white shadow-overlay"
          >
            <div className="flex items-start gap-2.5 border-b border-ink-200 px-3 py-2.5">
              <Avatar initials={actingUser.initials} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-800">
                  {actingUser.name}
                  {actingUser.isMD ? <Badge tone="brand">MD</Badge> : null}
                </p>
                <p className="text-2xs text-ink-500">
                  {actingUser.jobTitle}
                  {actingUser.department ? ` · ${DEPARTMENT_LABELS[actingUser.department]}` : ""}
                </p>
                <p className="mt-0.5 text-2xs text-ink-400">Signed in as {ROLE_LABELS[role]}</p>
              </div>
            </div>

            <div className="p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => void leaveForSignIn()}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-xs text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
              >
                <UserCog className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  Switch user
                  <span className="block text-2xs text-ink-500">
                    Pick any demo account with one click
                  </span>
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setConfirmReset(true);
                }}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-xs text-ink-700 transition-colors hover:bg-ink-100"
              >
                <RotateCcw className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                Clear all enquiries
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => void leaveForSignIn()}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-xs text-ink-700 transition-colors hover:bg-bad-50 hover:text-bad-700"
              >
                <LogOut className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                Sign out
              </button>
            </div>

          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemo();
          setConfirmReset(false);
          toast.success("All enquiries cleared. The system is back to its starting state.");
          router.push("/dashboard");
        }}
        title="Clear all enquiries?"
        confirmLabel="Reset to starting state"
        tone="danger"
        body={
          <>
            Every enquiry registered in this browser, with its decisions, BOQs, documents, work orders and
            activity history, will be permanently discarded. The people directory and client list are kept.
          </>
        }
      />
    </>
  );
}

/* --------------------------------------------------------------- shared --- */

function useOnClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  React.useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [ref, handler]);
}
