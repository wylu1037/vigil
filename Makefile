# vigil pinger — scriptc 原生二进制构建（codex / claude 两个变体）
# 共享逻辑在 pinger/，两个入口只描述各自 relay 的请求格式。
SHARED     := $(wildcard pinger/*.ts)
CODEX_SRC  := codex/pinger.ts
CODEX_BIN  := codex/pinger
CLAUDE_SRC := claude/pinger.ts
CLAUDE_BIN := claude/pinger

.PHONY: all pinger codex claude check clean

all: codex claude
pinger: all

codex: $(CODEX_BIN)
claude: $(CLAUDE_BIN)

# 共享模块改了也要重编，所以把 $(SHARED) 列进依赖
$(CODEX_BIN): $(CODEX_SRC) $(SHARED)
	scriptc build "$(CODEX_SRC)" -o "$(CODEX_BIN)"

$(CLAUDE_BIN): $(CLAUDE_SRC) $(SHARED)
	scriptc build "$(CLAUDE_SRC)" -o "$(CLAUDE_BIN)"

# 纯逻辑自检（参数解析 / .env 解析），用 node 原生剥类型直接跑
check:
	node pinger/check.ts

clean:
	rm -f $(CODEX_BIN) $(CLAUDE_BIN)
