import type { FastifyReply } from 'fastify'
import type { z } from '@reac/core'

export function problem(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode, exposed: true })
}
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')).filter(Boolean))]
    throw problem(400, fields.length ? 'Revisá los campos: ' + fields.join(', ') + '.' : 'La solicitud tiene un formato inválido.')
  }
  return result.data
}
export function must<T>(value: T | undefined) {
  if (!value) throw problem(404, 'No se encontró el registro.')
  return value
}
export function attach(reply: FastifyReply, filename: string, type: string, body: string) {
  return reply.header('Content-Disposition', 'attachment; filename="' + filename + '"').type(type).send(body)
}

