## Context

`platform-container-dev` 有一條需求：

> **容器設定不得受 host 的環境檔影響** —— 系統 SHALL 遮蔽 bind mount 帶入的
> `apps/api/.env`，使容器的設定只有兩個來源。

那條需求解決的是真實問題（host 的 `REDIS_URL` 指向 `localhost:6379`，容器裡連不到），
但它把「**不要讓連線設定被打壞**」實作成「**完全不讀**」——
而後者的代價是每次要在容器調一個開關都得改另一個進版控的檔。

這支 change 把保護的對象收斂到真正需要保護的那些。

## Goals / Non-Goals

**Goals:**

- 容器採用「compose 有設的就贏，沒設的吃 host `.env`」。
- 連線類變數**不可能**被 host 覆寫——靠 compose 釘死 + 守則，不靠遮蔽。
- 個人偏好不進版控，共用基準進版控。

**Non-Goals:**

- **不移除 `docker/api.container.env` 的遮蔽掛載**（見 D2）。
- 不改任何變數的預設值（除了在 compose 釘死既有變數）。
- 不處理 web 服務——它的設定只有兩個變數且都由 compose 設。

## Decisions

### D1：靠 compose 的原生優先序，不自己造機制

實測（compose 5.1.2）：

```
compose environment  >  env_file  >  容器內 .env（dotenv）  >  envSchema 預設
```

驗證方式是拿 `DB_HOST` 當試紙——compose 設 `postgres`、host `.env` 設 `127.0.0.1`。
加上 `env_file` 之後容器仍然看到 `postgres`，而只有 host 才有的 `SESSION_SECRET`
也確實被讀進來了。**兩件事同時成立才證明優先序，缺一個都不算。**

因此不需要任何篩選或轉換機制：`env_file` 一行就得到要的語意。

### D2：遮蔽掛載保留，兩個檔各有職責

拿掉遮蔽也能達到同樣效果（dotenv 讀 bind mount 進來的 host `.env`），但**不拿掉**，
因為兩份檔的讀者不同：

| 檔案 | 進版控 | 用途 |
| --- | --- | --- |
| `docker/api.container.env` | ✅ | **隊友共用的容器基準**——所有人跑起來一樣 |
| `apps/api/.env` | ❌ | **個人偏好**——只影響自己這台 |

遮蔽保留還有一個效果：容器內 `.env` 的內容是可預期的，
`docker compose exec api head apps/api/.env` 看到的是共用基準而不是某個人的檔案。

⚠️ **但要誠實標記一個副作用**：加了 `env_file` 之後，「共用基準」在三者中
**優先序最低**（`environment` > `env_file`（個人）> 本檔（共用））。
也就是說個人的 `.env` 會蓋掉隊友共用的值——這與「基準」的直覺相反。
目前無實害：`docker/api.container.env` **一個有效設定都沒有，全是註解**。
真正需要「不可被個人覆寫」的設定應該寫進 compose 的 `environment:`，
這一點已寫進該檔檔頭，避免有人把值寫進去卻不生效。

### D3：釘死四個，而不是全部十一個

envSchema 的連線類變數（`*_HOST` / `*_PORT` / `*_URL`）共 11 個，compose 只設了 4 個。
逐個判斷「從 host 漏進來會怎樣」：

| 變數 | 漏進來的後果 | 處置 |
| --- | --- | --- |
| `REDIS_URL` | **繞過 `REDIS_HOST: redis`**（factory 是 `URL ? url : {host,port}`），Redis 連不到而降級運行 | **釘死為空字串**（falsy 走回 HOST/PORT） |
| `SMTP_HOST` / `SMTP_PORT` | 本機 mail catcher 的位址在容器內連不到，寄信失敗 | 釘死 |
| `API_BASE_URL` | 驗證信連結指向 host 的位址 | 釘死（順帶修 bug，見 D4） |
| `APP_FRONT_URL`／`APP_PASSWORD_RESET_URL`／`LOCAL_MEDIA_BASE_URL` | 都是**前台網站的位址或路徑**，不是容器要連出去的目標 | 豁免，寫理由 |

**不全部釘死**：豁免的那三個本來就該由開發者依自己的前台設定決定，
釘死等於逼所有人用同一個前台位址。守則因此要有豁免清單而不是硬性全覆蓋——
**沒有豁免機制的規則會被整條關掉**，那是本專案已經寫過的判斷
（見 `testing.md` 的「一條會誤報的守則會被繞過」）。

### D4：`API_BASE_URL` 的釘死順帶修一個潛伏 bug

它預設 `http://localhost:3000`，而 `enforce-single-entry-container` 關掉 api 的
對外埠之後，**那個位址從 host 已經連不到**。容器模式產生的信箱驗證連結因此是壞的。

沒有人發現，是因為 dev 不會真的觸發寄信——這正是
`testing.md` 那一節講的形狀：**送到系統外面去的字串，系統內部永遠不會呼叫它**。

釘死成 `http://127.0.0.1:${APP_PROXY_PORT:-8080}`（代理位址）即修正。

### D5：守則盯的是「compose 有沒有釘」，不是「值對不對」

守則能檢查「連線類變數是否出現在 compose 的 api `environment:`」，
**不能**檢查值是否正確（那需要知道每個變數的語意）。

這是刻意的分工：值的正確性由實機驗收與 e2e 負責，
守則負責的是「**新增一個連線類變數時，有沒有人想過它在容器裡該是什麼**」——
而那個「有沒有想過」正是漏掉時完全沒有徵兆的部分。

## Risks / Trade-offs

- **容器行為從此受本機設定影響**，與原需求相反。同一份 compose 在兩台機器上
  可能行為不同——但差異只會落在 compose 沒設的變數，而連線類已被釘死 + 守則守著。
  **可重現性的損失是真的**，交換的是日常調整的成本。
- **守則的豁免清單會被濫用**：加不進 compose 就往豁免加。緩解是要求寫理由，
  但沒有機器能檢查理由是否成立——這是自律項，誠實標記。
- **`env_file` 的 `required: false` 需要 Compose v2.24+**。本機 5.1.2，CI 不使用
  compose 跑 api（走 service container），所以不受影響。

## Open Questions

無。
