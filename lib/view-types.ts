/** 传给客户端组件的序列化后场次数据（Date 换成毫秒时间戳）。 */
export type StreamItem = {
  id: number;
  title: string;
  description: string | null;
  startAtMs: number;
  durationMin: number;
  cancelled: boolean;
  note: string | null;
  colorKey: string | null;
  coverUrl: string | null;
};
