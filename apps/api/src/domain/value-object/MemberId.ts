import { v4 as uuidv4 } from 'uuid';
import { InvalidMemberIdException } from '../exception/InvalidMemberIdException';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MemberId {
  private constructor(private readonly value: string) {}

  static generate(): MemberId {
    return new MemberId(uuidv4());
  }

  /**
   * 驗證格式後建立 MemberId
   * @param value - 未經驗證的 ID 字串（使用者輸入）
   * @throws InvalidMemberIdException 非 UUID 格式時
   */
  static of(value: string): MemberId {
    if (!UUID_REGEX.test(value)) {
      throw new InvalidMemberIdException();
    }
    return new MemberId(value);
  }

  /**
   * 從已持久化的資料還原，不重複驗證。
   *
   * 與 `of()` 分開的理由見 `Email.trusted()`：還原路徑重跑驗證會把資料損毀
   * 誤報成客戶端的輸入錯誤。
   *
   * @param value - 資料庫中的 ID
   */
  static trusted(value: string): MemberId {
    return new MemberId(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: MemberId): boolean {
    return this.value === other.toString();
  }
}
