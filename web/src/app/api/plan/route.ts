import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

type SuggestedTask = {
  title: string
  description?: string
  due_date?: string
  priority?: 'low' | 'medium' | 'high'
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.FOCUSFLOW_ANTHROPIC_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'FOCUSFLOW_ANTHROPIC_KEY not configured on the server' },
        { status: 500 }
      )
    }
    const client = new Anthropic({ apiKey })

    const { prompt } = await req.json()
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const today = new Date().toISOString().slice(0, 10)

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: `You are a productivity assistant for an app called FocusFlow.

Your job: turn the user's goal or context into a concrete, actionable list of tasks.

Rules:
- Return between 3 and 10 tasks.
- Tasks must be specific and actionable (start with a verb).
- Detect the user's language and respond in the same language.
- Spread due_date across the next 1-30 days when relevant. Today is ${today}.
- Set priority for important/urgent tasks. Leave it off for routine ones.
- ALWAYS include a description for every task (1-2 sentences). The description should explain HOW to do the task or what concretely it involves — not just rephrase the title.
- Keep titles concise (under 60 chars).
- Don't include the user's original goal verbatim — break it down.`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: prompt }],
      tools: [
        {
          name: 'create_tasks',
          description: "Submit the list of tasks for the user's goal.",
          input_schema: {
            type: 'object',
            properties: {
              tasks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    due_date: {
                      type: 'string',
                      description: 'ISO date YYYY-MM-DD, optional',
                    },
                    priority: {
                      type: 'string',
                      enum: ['low', 'medium', 'high'],
                    },
                  },
                  required: ['title', 'description'],
                },
              },
            },
            required: ['tasks'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'create_tasks' },
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      return NextResponse.json({ error: 'No tasks returned' }, { status: 500 })
    }

    const { tasks } = toolUse.input as { tasks: SuggestedTask[] }
    return NextResponse.json({ tasks })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
