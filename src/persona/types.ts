// MIT License — personal-ai
import { z } from 'zod'

export const PersonaConfigSchema = z.object({
  name: z.string(),
  user_name: z.string().optional(),
  tone: z.string().optional(),
  expertise: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  custom_instructions: z.string().optional(),
})

export const ProfileConfigSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  system_addon: z.string().default(''),
  preferred_model: z.string().default('qwen2.5:14b'),
  tools_priority: z.array(z.string()).default([]),
  temperature: z.number().min(0).max(2).default(0.7),
})

export const ProfilesConfigSchema = z.object({
  active: z.string().default('assistant'),
  profiles: z.record(z.string(), ProfileConfigSchema),
})

export type PersonaConfig  = z.infer<typeof PersonaConfigSchema>
export type ProfileConfig  = z.infer<typeof ProfileConfigSchema>
export type ProfilesConfig = z.infer<typeof ProfilesConfigSchema>
