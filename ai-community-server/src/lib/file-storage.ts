import COS from 'cos-nodejs-sdk-v5'
import fs from 'fs'
import path from 'path'
import type { RequestHandler } from 'express'

export type StoredFile = {
  url: string
  storedName: string
}

export function storageDriver(): 'local' | 'cos' {
  const configured = (process.env.FILE_STORAGE_DRIVER || process.env.STORAGE_DRIVER || 'local').toLowerCase()
  return configured === 'cos' ? 'cos' : 'local'
}

function cosConfig() {
  const SecretId = process.env.COS_SECRET_ID
  const SecretKey = process.env.COS_SECRET_KEY
  const Bucket = process.env.COS_BUCKET
  const Region = process.env.COS_REGION
  if (!SecretId || !SecretKey || !Bucket || !Region) {
    throw new Error('BUSINESS_COS 存储配置不完整')
  }
  return { SecretId, SecretKey, Bucket, Region }
}

export async function persistCover(file: Express.Multer.File): Promise<StoredFile> {
  const filename = file.filename
  if (storageDriver() !== 'cos') {
    return { url: `/api/uploads/covers/${filename}`, storedName: filename }
  }

  const { SecretId, SecretKey, Bucket, Region } = cosConfig()
  const Key = `covers/${filename}`
  const cos = new COS({ SecretId, SecretKey })
  try {
    await new Promise<void>((resolve, reject) => {
      cos.putObject({
        Bucket,
        Region,
        Key,
        Body: fs.createReadStream(file.path),
        ContentLength: file.size,
        ContentType: file.mimetype,
      }, (error) => error ? reject(error) : resolve())
    })
  } finally {
    fs.rmSync(file.path, { force: true })
  }

  // 数据库始终保存同域稳定地址。COS 桶可以保持私有，读取时由后端生成短期签名地址。
  return { url: `/api/uploads/covers/${filename}`, storedName: filename }
}

export const serveStoredCover: RequestHandler = (req, res, next) => {
  if (storageDriver() !== 'cos') {
    res.status(404).json({ error: '封面不存在', code: 'NOT_FOUND' })
    return
  }

  try {
    const filename = path.basename(req.params.filename)
    const { SecretId, SecretKey, Bucket, Region } = cosConfig()
    const cos = new COS({ SecretId, SecretKey })
    const configuredExpire = Number(process.env.SIGNED_URL_EXPIRE_SECONDS)
    const Expires = Number.isFinite(configuredExpire) && configuredExpire > 0
      ? Math.min(3600, Math.floor(configuredExpire))
      : 300

    cos.getObjectUrl({ Bucket, Region, Key: `covers/${filename}`, Sign: true, Expires }, (error, data) => {
      if (error || !data?.Url) {
        next(error || new Error('BUSINESS_封面访问地址生成失败'))
        return
      }
      res.setHeader('Cache-Control', 'private, max-age=60')
      res.redirect(302, data.Url)
    })
  } catch (error) {
    next(error)
  }
}
