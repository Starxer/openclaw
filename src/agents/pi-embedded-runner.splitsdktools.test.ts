import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { splitSdkTools } from "./pi-embedded-runner.js";

const hookMocks = vi.hoisted(() => ({
  runner: {
    hasHooks: vi.fn((_: string) => false),
    runAfterToolCall: vi.fn(async () => {}),
  },
  isToolWrappedWithBeforeToolCallHook: vi.fn(() => false),
  consumeAdjustedParamsForToolCall: vi.fn((_: string) => undefined as unknown),
  runBeforeToolCallHook: vi.fn(async ({ params }: { params: unknown }) => ({
    blocked: false,
    params,
  })),
}));

vi.mock("../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => hookMocks.runner,
}));

vi.mock("./pi-tools.before-tool-call.js", () => ({
  consumeAdjustedParamsForToolCall: hookMocks.consumeAdjustedParamsForToolCall,
  isToolWrappedWithBeforeToolCallHook: hookMocks.isToolWrappedWithBeforeToolCallHook,
  runBeforeToolCallHook: hookMocks.runBeforeToolCallHook,
}));

function createStubTool(name: string): AgentTool {
  return {
    name,
    label: name,
    description: "",
    parameters: Type.Object({}),
    execute: async () => ({}) as AgentToolResult<unknown>,
  };
}

describe("splitSdkTools", () => {
  beforeEach(() => {
    hookMocks.runner.hasHooks.mockClear();
    hookMocks.runner.runAfterToolCall.mockClear();
    hookMocks.runner.runAfterToolCall.mockResolvedValue(undefined);
    hookMocks.isToolWrappedWithBeforeToolCallHook.mockClear();
    hookMocks.isToolWrappedWithBeforeToolCallHook.mockReturnValue(false);
    hookMocks.consumeAdjustedParamsForToolCall.mockClear();
    hookMocks.consumeAdjustedParamsForToolCall.mockReturnValue(undefined);
    hookMocks.runBeforeToolCallHook.mockClear();
    hookMocks.runBeforeToolCallHook.mockImplementation(async ({ params }) => ({
      blocked: false,
      params,
    }));
  });

  const tools = [
    createStubTool("read"),
    createStubTool("exec"),
    createStubTool("edit"),
    createStubTool("write"),
    createStubTool("browser"),
  ];

  it("routes all tools to customTools when sandboxed", () => {
    const { builtInTools, customTools } = splitSdkTools({
      tools,
      sandboxEnabled: true,
    });
    expect(builtInTools).toEqual([]);
    expect(customTools.map((tool) => tool.name)).toEqual([
      "read",
      "exec",
      "edit",
      "write",
      "browser",
    ]);
  });

  it("routes all tools to customTools even when not sandboxed", () => {
    const { builtInTools, customTools } = splitSdkTools({
      tools,
      sandboxEnabled: false,
    });
    expect(builtInTools).toEqual([]);
    expect(customTools.map((tool) => tool.name)).toEqual([
      "read",
      "exec",
      "edit",
      "write",
      "browser",
    ]);
  });

  it("propagates hookContext to adapter after_tool_call dispatch", async () => {
    hookMocks.runner.hasHooks.mockImplementation((name: string) => name === "after_tool_call");
    const tool = createStubTool("read");
    const { customTools } = splitSdkTools({
      tools: [tool],
      sandboxEnabled: true,
      hookContext: { agentId: "main", sessionKey: "session-split" },
    });
    const custom = customTools[0];
    if (!custom) {
      throw new Error("missing custom tool");
    }

    await custom.execute("call-split", { path: "/tmp/file" }, undefined, undefined, {} as never);

    expect(hookMocks.runner.runAfterToolCall).toHaveBeenCalledTimes(1);
    expect(hookMocks.runner.runAfterToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "read",
      }),
      {
        toolName: "read",
        agentId: "main",
        sessionKey: "session-split",
      },
    );
  });
});
