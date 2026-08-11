import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { authRequired } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'

const router = Router()

// 上传目录（按类型分文件夹）
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads')
const COVER_DIR = path.join(UPLOAD_DIR, 'covers')
const ATTACHMENT_DIR = path.join(UPLOAD_DIR, 'attachments')

// 确保目录存在
for (const dir of [UPLOAD_DIR, COVER_DIR, ATTACHMENT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// 文件名生成：时间戳 + 随机串，保留原始扩展名
function genFileName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase()
  const base = Date.now().toString(36) + crypto.randomBytes(12).toString('hex')
  return `${base}${ext}`
}

// 封面上传：仅图片，限制 5MB
const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, COVER_DIR),
  filename: (_req, file, cb) => cb(null, genFileName(file.originalname)),
})
const coverUpload = multer({
  storage: coverStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true)
    else cb(new Error('BUSINESS_封面仅支持图片格式（jpg/png/webp/gif）'))
  },
})

// 附件上传：支持 PRD 允许的常见文件类型，限制 100MB
const attachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ATTACHMENT_DIR),
  filename: (_req, file, cb) => cb(null, genFileName(file.originalname)),
})
const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // 禁止可执行脚本（安全考虑）
    const forbidden = /\.(exe|bat|cmd|sh|js|ts)$/i
    if (forbidden.test(file.originalname)) {
      cb(new Error('BUSINESS_禁止上传可执行脚本文件'))
      return
    }
    cb(null, true)
  },
})

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// POST /api/upload/cover —— 封面上传
router.post('/cover', authRequired, coverUpload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '请选择封面图片', code: 'VALIDATION_ERROR' })
    return
  }
  res.json({
    url: `/uploads/covers/${req.file.filename}`,
    name: req.file.originalname,
    size: formatSize(req.file.size),
  })
})

// POST /api/upload/attachment —— 附件上传
router.post('/attachment', authRequired, attachmentUpload.single('file'), async (req, res, next) => {
  if (!req.file) {
    res.status(400).json({ error: '请选择附件', code: 'VALIDATION_ERROR' })
    return
  }
  try {
    const pending = await prisma.pendingUpload.create({
      data: {
        storedName: req.file.filename,
        uploaderId: req.userId!,
        name: req.file.originalname,
        size: formatSize(req.file.size),
        url: `/api/upload/attachment/${req.file.filename}`,
      },
    })
    res.json({ id: pending.id, url: pending.url, name: pending.name, size: pending.size, storedName: pending.storedName })
  } catch (error) {
    fs.rmSync(req.file.path, { force: true })
    next(error)
  }
})

router.get('/attachment/:filename', authRequired, async (req, res, next) => {
  try {
    const attachment = await prisma.attachment.findFirst({
      where: { storedName: req.params.filename },
      include: { work: true, version: true },
    })
    if (!attachment) {
      res.status(404).json({ error: '文件不存在', code: 'NOT_FOUND' })
      return
    }
    const canManage = attachment.work.authorId === req.userId || (req.userRoles || []).some((role) => ['reviewer', 'operator', 'super_admin'].includes(role))
    const isCurrentPublished = attachment.work.status === 'published' && !!attachment.version?.current
    if (!canManage && !isCurrentPublished) {
      res.status(404).json({ error: '文件不存在', code: 'NOT_FOUND' })
      return
    }
    const filePath = path.join(ATTACHMENT_DIR, path.basename(req.params.filename))
    res.download(filePath, attachment.name)
  } catch (error) {
    next(error)
  }
})

// DELETE /api/upload/attachment/:filename —— 仅上传者可删除未关联文件或自己的草稿附件
router.delete('/attachment/:filename', authRequired, async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename)
    const pending = await prisma.pendingUpload.findUnique({ where: { storedName: filename } })
    if (pending) {
      if (pending.uploaderId !== req.userId) {
        res.status(403).json({ error: '无权删除该文件', code: 'FORBIDDEN' })
        return
      }
      await prisma.pendingUpload.delete({ where: { id: pending.id } })
    } else {
      const attachment = await prisma.attachment.findFirst({ where: { storedName: filename }, include: { version: true } })
      if (!attachment) {
        res.status(404).json({ error: '文件不存在', code: 'NOT_FOUND' })
        return
      }
      if (attachment.uploaderId !== req.userId || attachment.version?.status !== 'draft') {
        res.status(403).json({ error: '只能删除自己的草稿附件', code: 'FORBIDDEN' })
        return
      }
      await prisma.attachment.delete({ where: { id: attachment.id } })
      const remainingReferences = await prisma.attachment.count({ where: { storedName: filename } })
      if (remainingReferences > 0) {
        res.json({ success: true })
        return
      }
    }
    const filePath = path.join(ATTACHMENT_DIR, filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

export default router
