import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/api/sessionUser";
import {
  addDailyTodoItem,
  getOrCreateDailyTodos,
  updateDailyTodoItem,
} from "@/lib/db/dailyTodos";
import { parseJsonBody } from "@/lib/validation/http";

const todoActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    timezone: z.string().optional(),
    label: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("toggle"),
    timezone: z.string().optional(),
    todoId: z.string().min(1),
    done: z.boolean(),
  }),
  z.object({
    action: z.literal("rename"),
    timezone: z.string().optional(),
    todoId: z.string().min(1),
    label: z.string().trim().min(1),
  }),
]);

function resolveTimezone(input: string | null): string {
  const value = input?.trim();
  if (!value) return "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const timezone = resolveTimezone(
      new URL(request.url).searchParams.get("timezone")
    );
    const daily = await getOrCreateDailyTodos(userId, timezone);
    return NextResponse.json({
      data: {
        mode: "todo",
        title: "Today checklist",
        subtitle: "Small wins reset daily in your local timezone.",
        localDay: daily.localDay,
        timezone: daily.timezone,
        items: daily.items,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsedBody = await parseJsonBody({
      request,
      schema: todoActionSchema,
    });
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data;
    const timezone = resolveTimezone(body.timezone ?? null);
    if (body.action === "add") {
      const label = body.label?.trim();
      if (!label) {
        return NextResponse.json({ error: "label is required" }, { status: 400 });
      }
      await addDailyTodoItem({ userId, timezone, label });
    } else if (body.action === "toggle") {
      if (!body.todoId || typeof body.done !== "boolean") {
        return NextResponse.json(
          { error: "todoId and done are required for toggle" },
          { status: 400 }
        );
      }
      await updateDailyTodoItem({
        userId,
        todoId: body.todoId,
        done: body.done,
      });
    } else if (body.action === "rename") {
      if (!body.todoId || !body.label?.trim()) {
        return NextResponse.json(
          { error: "todoId and label are required for rename" },
          { status: 400 }
        );
      }
      await updateDailyTodoItem({
        userId,
        todoId: body.todoId,
        label: body.label,
      });
    } else {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const daily = await getOrCreateDailyTodos(userId, timezone);
    return NextResponse.json({
      data: {
        mode: "todo",
        title: "Today checklist",
        subtitle: "Small wins reset daily in your local timezone.",
        localDay: daily.localDay,
        timezone: daily.timezone,
        items: daily.items,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
