const actionLabels: Readonly<Record<string, string>> = {
  abort_multipart_upload: '中止 S3 分片上传',
  change_password: '修改密码',
  complete_multipart_upload: '完成 S3 分片上传',
  copy: '复制文件',
  create_access_policy: '创建访问策略',
  create_folder: '创建文件夹',
  create_image_bed_token: '创建图床 Token',
  create_multipart_upload: '创建 S3 分片上传',
  create_s3_credential: '创建 S3 凭据',
  create_share: '创建文件分享',
  create_source: '新建存储源',
  create_user: '创建用户',
  delete: '删除文件',
  delete_access_policy: '删除访问策略',
  delete_anonymous_image: '删除匿名图片',
  delete_image_bed_token: '撤销图床 Token',
  delete_object: 'S3 删除对象',
  delete_s3_credential: '撤销 S3 凭据',
  delete_source: '删除存储源',
  delete_user: '删除用户',
  disable_s3_credential: '禁用 S3 凭据',
  disable_source: '禁用存储源',
  disable_user: '禁用用户',
  enable_s3_credential: '启用 S3 凭据',
  enable_source: '启用存储源',
  enable_user: '启用用户',
  export_system_config: '导出系统配置',
  image_delete: '删除图片',
  image_upload: '上传图片',
  lock: '锁定 WebDAV 文件',
  login_failed: '登录失败',
  login_success: '登录成功',
  move: '移动文件',
  purge: '彻底删除文件',
  put_object: 'S3 上传对象',
  reconcile_source: '校准存储源台账',
  refresh_lock: '刷新 WebDAV 锁',
  rename: '重命名文件',
  reset_password: '重置用户密码',
  reset_token_image_bed: '重置图床 Token',
  reset_token_webdav: '重置 WebDAV Token',
  restore: '恢复文件',
  revoke_share: '撤销文件分享',
  revoke_user_credentials: '撤销用户全部凭据',
  share_download: '通过分享下载文件',
  batch_download: '批量下载文件',
  trash: '移入回收站',
  unlock: '解锁 WebDAV 文件',
  update_access_policy: '更新访问策略',
  update_anonymous_image_bed: '更新匿名图床设置',
  update_exclude_patterns: '更新排除规则',
  update_source: '更新存储源',
  update_user_quota: '更新用户配额',
  upload: '上传文件',
  upload_part: '上传 S3 分片',
}

const actorLabels: Readonly<Record<string, string>> = {
  anonymous: '匿名访客',
  system: '系统',
  user: '用户',
}

const entryLabels: Readonly<Record<string, string>> = {
  admin: '管理后台',
  anonymous_image_bed: '匿名图床',
  cli: '命令行',
  image_bed: '图床 API',
  s3: 'S3',
  web: '网页',
  webdav: 'WebDAV',
}

export function auditActionLabel(action: string): string | undefined {
  return actionLabels[action]
}

export function auditActorLabel(actorType: string): string | undefined {
  return actorLabels[actorType]
}

export function auditEntryLabel(entryType: string): string | undefined {
  return entryLabels[entryType]
}
