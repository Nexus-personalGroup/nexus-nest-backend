#!/usr/bin/env bash
# =============================================================================
# 新增 domain exception 的連動提醒（PostToolUse: Write）
# -----------------------------------------------------------------------------
# GlobalExceptionFilter 以 kind 自動映射 HTTP status，新增例外不必改 filter；
# 但錯誤碼與訊息表必須成對新增（訊息表以 satisfies Record<ResponseCode,…>
# 約束，少一邊會 typecheck 失敗）。
# exit 0 = 一律。
# =============================================================================
set -uo pipefail

file="$(jq -r '.tool_input.file_path // ""')"

case "$file" in
  *domain/exception/*)
    printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"新增了 domain/exception 檔案。GlobalExceptionFilter 不需要修改（kind 會自動映射成 HTTP status）；要做的是：(1) 把 code 加進 shared/constants/response-codes.ts；(2) 訊息加進 shared/constants/response-messages.ts（兩者必須成對，否則 typecheck 失敗）；(3) 從既有的 DomainExceptionKind 選一個語意類別。"}}'
    ;;
esac

exit 0
