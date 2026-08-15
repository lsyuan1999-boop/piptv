import AdminBoard from "./admin-board";
import { getAdminWindow, getSettings } from "@/lib/queries";
import { TIME_ZONE_LABEL, dayKey } from "@/lib/time";

export const metadata = { title: "管理直播日程" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const now = new Date();
  const [rows, config] = await Promise.all([
    getAdminWindow(now, 21),
    getSettings(),
  ]);

  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    startAtMs: r.startAt.getTime(),
    durationMin: r.durationMin,
    cancelled: r.cancelled,
    note: r.note,
    colorKey: r.colorKey,
    coverUrl: r.coverUrl,
  }));

  return (
    <AdminBoard
      items={items}
      config={config}
      serverNowMs={now.getTime()}
      todayKey={dayKey(now)}
      timeZoneLabel={TIME_ZONE_LABEL}
    />
  );
}
