import { z } from 'zod';
import { InvalidEmailException } from '../exception/InvalidEmailException';

export class Email {
  private constructor(private readonly value: string) {}

  /**
   * 驗證格式後建立 Email
   * @param value - 未經驗證的 email 字串（使用者輸入）
   * @throws InvalidEmailException 格式不合法時
   */
  static of(value: string): Email {
    if (!z.string().email().safeParse(value).success) {
      throw new InvalidEmailException();
    }
    return new Email(value);
  }

  /**
   * 從已持久化的資料還原，不重複驗證。
   *
   * 與 `of()` 分開的理由：DB 中的值在寫入時已驗證過，若在還原路徑重跑驗證，
   * 資料損毀會被回報成 400（客戶端輸入錯誤），但實際上客戶端什麼都沒做錯。
   *
   * @param value - 資料庫中的 email
   */
  static trusted(value: string): Email {
    return new Email(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: Email): boolean {
    return this.value === other.toString();
  }
}
