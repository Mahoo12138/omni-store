import { describe, expect, it } from 'vitest'
import { auditActionLabel, auditActorLabel, auditEntryLabel } from './audit'

describe('auditActionLabel', () => {
  it.each([
    ['login_success', '登录成功'],
    ['export_system_config', '导出系统配置'],
    ['create_multipart_upload', '创建 S3 分片上传'],
    ['trash', '移入回收站'],
  ])('translates %s', (action, expected) => {
    expect(auditActionLabel(action)).toBe(expected)
  })

  it('leaves unknown actions available for an explicit fallback', () => {
    expect(auditActionLabel('future_action')).toBeUndefined()
  })
})

describe('auditActorLabel', () => {
  it.each([
    ['user', '用户'],
    ['anonymous', '匿名访客'],
    ['system', '系统'],
  ])('translates %s', (actorType, expected) => {
    expect(auditActorLabel(actorType)).toBe(expected)
  })

  it('leaves unknown actor types available for an explicit fallback', () => {
    expect(auditActorLabel('future_actor')).toBeUndefined()
  })
})

describe('auditEntryLabel', () => {
  it.each([
    ['web', '网页'],
    ['webdav', 'WebDAV'],
    ['image_bed', '图床 API'],
    ['anonymous_image_bed', '匿名图床'],
    ['admin', '管理后台'],
    ['cli', '命令行'],
  ])('translates %s', (entryType, expected) => {
    expect(auditEntryLabel(entryType)).toBe(expected)
  })

  it('leaves unknown entry types available for an explicit fallback', () => {
    expect(auditEntryLabel('future_entry')).toBeUndefined()
  })
})
