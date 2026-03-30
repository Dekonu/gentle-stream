import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/api/sessionUser";
import {
  addDailyTodoItem,
  getOrCreateDailyTodos,
  updateDailyTodoItem,
} from "@/lib/db/dailyTodos";

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
    const body = (await request.json()) as {
      timezone?: string;
      action?: "add" | "toggle" | "rename";
      todoId?: string;
      done?: boolean;
      label?: string;
    };
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
