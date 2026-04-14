const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 달력 날짜(전시 일차 집계용) */
export function exhibitionDayKst(isoFromServer = new Date()): string {
  const kst = new Date(isoFromServer.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}
