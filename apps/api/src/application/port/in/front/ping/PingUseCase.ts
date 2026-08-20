export const PING_USE_CASE = 'PING_USE_CASE';

/** 前台健康探測結果（骨架示範用） */
export interface PingResult {
  message: string;
}

export interface PingUseCase {
  execute(): PingResult;
}
