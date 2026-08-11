import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import multer from 'multer'

// 统一错误响应
export interface ApiError {
  error: string
  code?: string
  details?: unknown
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[ERROR]', err.message)

  if (err instanceof ZodError) {
    res.status(400).json({
      error: '参数校验失败',
      code: 'VALIDATION_ERROR',
      details: err.errors,
    } satisfies ApiError)
    return
  }

  if (err instanceof multer.MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      error: err.code === 'LIMIT_FILE_SIZE' ? '上传文件超过大小限制' : '文件上传失败',
      code: err.code,
    })
    return
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: '数据已存在，请勿重复提交', code: 'CONFLICT' })
      return
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: '目标数据不存在', code: 'NOT_FOUND' })
      return
    }
    if (err.code === 'P2003') {
      res.status(409).json({ error: '数据仍被其他记录使用，无法删除', code: 'IN_USE' })
      return
    }
  }

  if (err.message.startsWith('BUSINESS_')) {
    // 业务错误：以 BUSINESS_ 前缀标识
    res.status(400).json({ error: err.message, code: 'BUSINESS_ERROR' } satisfies ApiError)
    return
  }

  res.status(500).json({ error: '服务器内部错误', code: 'INTERNAL_ERROR' } satisfies ApiError)
}

// 业务错误便捷抛出
export class BusinessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BusinessError'
  }
}
