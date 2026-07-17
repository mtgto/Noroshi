import { isAbsolutePath } from "./config";

/**
 * JSON parser used by the tool_start/tool_end/stop hooks. session_id and
 * prompt_id are only on the hook's stdin JSON (there is no CLAUDE_SESSION_ID
 * env var), so those hooks need something that can read JSON. Hooks run under
 * `sh -c` in the Claude Code environment — VSCode's own node is not on that
 * PATH — so the user picks whatever their environment actually has.
 */
export type HookInterpreter = "jq" | "python3" | "node" | "ruby";

export type MenuActionId =
  | "copyHookSnippet"
  | "openSetupGuide"
  | "toggleEnabled"
  | "showLog"
  | "openSettings";

export interface MenuItem {
  id: MenuActionId;
  label: string;
  description: string;
}

/** Build the status-bar quick pick's items. Order is fixed; only the toggle label depends on state. */
export function buildMenuItems(enabled: boolean): MenuItem[] {
  return [
    {
      id: "copyHookSnippet",
      label: "$(clippy) Copy Hook Snippet",
      description: "Copy the Claude Code hook JSON to the clipboard",
    },
    {
      id: "openSetupGuide",
      label: "$(book) Open Setup Guide",
      description: "Show this extension's README (setup instructions)",
    },
    {
      id: "toggleEnabled",
      label: enabled ? "$(circle-slash) Disable Noroshi" : "$(check) Enable Noroshi",
      description: "Toggle noroshi.enabled",
    },
    {
      id: "showLog",
      label: "$(output) Show Output Log",
      description: "Open the Noroshi output channel",
    },
    {
      id: "openSettings",
      label: "$(gear) Open Settings",
      description: "Open Noroshi's settings",
    },
  ];
}

/**
 * Build the Claude Code hooks JSON for the current eventsFile setting, ready to
 * paste into .claude/settings.json. A relative eventsFile is anchored under
 * $CLAUDE_PROJECT_DIR; an absolute one (a remote/Pod path) is used as-is.
 *
 * Passing toolWaitInterpreter adds the PreToolUse/PostToolUse hooks and switches
 * Stop to the same parser (Stop needs session_id to reset the right session).
 * Notification stays on printf: it needs no fields from stdin, and it would only
 * pay the interpreter's startup cost for nothing.
 */
export function buildHookSnippet(
  eventsFile: string,
  toolWaitInterpreter?: HookInterpreter,
): string {
  const target = isAbsolutePath(eventsFile) ? eventsFile : `$CLAUDE_PROJECT_DIR/${eventsFile}`;
  const hooks: Record<string, unknown> = {
    Notification: [
      { hooks: [{ type: "command", command: printfCommand("notification", target) }] },
    ],
    // Fires in both the terminal CLI and the VSCode extension (verified on
    // 2.1.207 for both the tool-permission dialog and the AskUserQuestion
    // elicitation dialog) — this is what actually gets Noroshi its sound in
    // the extension, where Notification alone does not fire
    // (github.com/anthropics/claude-code/issues/8985#issuecomment-3798023834).
    PermissionRequest: [
      { hooks: [{ type: "command", command: printfCommand("notification", target) }] },
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: toolWaitInterpreter
              ? parserCommand(toolWaitInterpreter, "stop", target, false)
              : printfCommand("stop", target),
          },
        ],
      },
    ],
  };

  if (toolWaitInterpreter) {
    hooks.PreToolUse = [
      {
        hooks: [
          {
            type: "command",
            command: parserCommand(toolWaitInterpreter, "tool_start", target, true),
          },
        ],
      },
    ];
    hooks.PostToolUse = [
      {
        hooks: [
          {
            type: "command",
            command: parserCommand(toolWaitInterpreter, "tool_end", target, true),
          },
        ],
      },
    ];
  }

  return JSON.stringify({ hooks }, null, 2);
}

function printfCommand(kind: "notification" | "stop", target: string): string {
  return (
    `printf '{"event":"${kind}","entrypoint":"%s"}\\n' ` +
    `"\${CLAUDE_CODE_ENTRYPOINT:-unknown}" >> "${target}"  # noroshi`
  );
}

/**
 * Emit one JSON line carrying session_id/prompt_id (+ tool_name for tool
 * events). tool_input is deliberately excluded: it can be hundreds of KB (a
 * Write's content), the events file is read and deleted on every drain, and a
 * line over PIPE_BUF (4096) would break the atomicity that concurrent `>>`
 * appends rely on. It also buys nothing — the count-based tracker never needs
 * to match a tool_end to its tool_start.
 */
function parserCommand(
  interp: HookInterpreter,
  kind: string,
  target: string,
  withToolName: boolean,
): string {
  return `${parserBody(interp, kind, withToolName)} >> "${target}"  # noroshi`;
}

function parserBody(interp: HookInterpreter, kind: string, withToolName: boolean): string {
  const ep = `"\${CLAUDE_CODE_ENTRYPOINT:-unknown}"`;
  switch (interp) {
    case "jq": {
      const fields = withToolName ? "session_id,prompt_id,tool_name" : "session_id,prompt_id";
      return `jq -c --arg ep ${ep} '{event:"${kind}",entrypoint:$ep,${fields}}'`;
    }
    case "python3": {
      const tool = withToolName ? `,"tool_name":d.get("tool_name")` : "";
      return (
        `python3 -c 'import sys,json,os;d=json.load(sys.stdin);` +
        `print(json.dumps({"event":"${kind}",` +
        `"entrypoint":os.environ.get("CLAUDE_CODE_ENTRYPOINT","unknown"),` +
        `"session_id":d.get("session_id"),"prompt_id":d.get("prompt_id")${tool}},` +
        `separators=(",",":")))'`
      );
    }
    case "node": {
      const tool = withToolName ? ",tool_name:d.tool_name" : "";
      return (
        `node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{` +
        `const d=JSON.parse(s);console.log(JSON.stringify({event:"${kind}",` +
        `entrypoint:process.env.CLAUDE_CODE_ENTRYPOINT||"unknown",` +
        `session_id:d.session_id,prompt_id:d.prompt_id${tool}}))})'`
      );
    }
    case "ruby": {
      const tool = withToolName ? `,tool_name:d["tool_name"]` : "";
      return (
        `ruby -rjson -e 'd=JSON.parse(STDIN.read);puts JSON.generate({event:"${kind}",` +
        `entrypoint:ENV["CLAUDE_CODE_ENTRYPOINT"]||"unknown",` +
        `session_id:d["session_id"],prompt_id:d["prompt_id"]${tool}})'`
      );
    }
  }
}
