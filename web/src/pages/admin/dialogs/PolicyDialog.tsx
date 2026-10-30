import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiRequestError } from '../../../api/client'
import { adminCreatePolicy, adminUpdatePolicy, type AdminSource, type AccessPermission, type AccessPolicy, type AccessPolicyInput, type AccessPolicyPathRule } from '../../../api/admin'
import { type User } from '../../../api/auth'
import { Checkbox, Input, Textarea } from '@fluentui/react-components'
import { Button } from '../../../components/ui/Button'
import { DialogWrap } from '../../../components/ui/Dialog'
import { Banner } from '../../../components/shell/Banner'
import { FormField } from '../../../components/shell/FormLayout'
import { Select } from '../../../components/ui/Select'
import { IconPlus, IconTrash } from '../../../components/ui/Icon'
import { useStyles } from '../sections/policies.styles'

export function PolicyDialog({
  open,
  policy,
  sources,
  users,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  policy?: AccessPolicy
  sources: AdminSource[]
  users: User[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const css = useStyles()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sourcePermissions, setSourcePermissions] = useState<Record<string, AccessPermission>>({})
  const [sourcePathRules, setSourcePathRules] = useState<Record<string, Array<AccessPolicyPathRule & { id: string }>>>({})
  const [userIDs, setUserIDs] = useState<number[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    setName(policy?.name ?? '')
    setDescription(policy?.description ?? '')
    setSourcePermissions(Object.fromEntries(
      policy?.sources.map((rule) => [rule.source_key, rule.permission]) ?? [],
    ))
    setSourcePathRules(Object.fromEntries(
      policy?.sources.map((rule) => [rule.source_key, rule.path_rules.map((pathRule) => ({
        ...pathRule,
        id: crypto.randomUUID(),
      }))]) ?? [],
    ))
    setUserIDs(policy?.users.map((user) => user.user_id) ?? [])
    setMessage('')
  }, [open, policy])

  const saveMutation = useMutation({
    mutationFn: (input: AccessPolicyInput) => policy
      ? adminUpdatePolicy(policy.key, input)
      : adminCreatePolicy(input),
    onSuccess: () => {
      onSaved()
      onOpenChange(false)
    },
    onError: (error) => setMessage(error instanceof ApiRequestError ? error.message : '保存失败'),
  })

  function toggleSource(sourceKey: string, checked: boolean) {
    setSourcePermissions((current) => {
      if (checked) return { ...current, [sourceKey]: current[sourceKey] ?? 'read_only' }
      const next = { ...current }
      delete next[sourceKey]
      return next
    })
    if (!checked) {
      setSourcePathRules((current) => {
        const next = { ...current }
        delete next[sourceKey]
        return next
      })
    }
  }

  function addPathRule(sourceKey: string) {
    setSourcePathRules((current) => ({
      ...current,
      [sourceKey]: [
        ...(current[sourceKey] ?? []),
        { id: crypto.randomUUID(), path_prefix: '', permission: 'read_write' },
      ],
    }))
  }

  function updatePathRule(sourceKey: string, id: string, patch: Partial<AccessPolicyPathRule>) {
    setSourcePathRules((current) => ({
      ...current,
      [sourceKey]: (current[sourceKey] ?? []).map((rule) => rule.id === id ? { ...rule, ...patch } : rule),
    }))
  }

  function removePathRule(sourceKey: string, id: string) {
    setSourcePathRules((current) => ({
      ...current,
      [sourceKey]: (current[sourceKey] ?? []).filter((rule) => rule.id !== id),
    }))
  }

  function toggleUser(userID: number, checked: boolean) {
    setUserIDs((current) => checked
      ? current.includes(userID) ? current : [...current, userID]
      : current.filter((id) => id !== userID))
  }

  function save() {
    if (!name.trim()) {
      setMessage('请输入策略名称')
      return
    }
    if (Object.values(sourcePathRules).some((rules) => rules.some((rule) => !rule.path_prefix.trim()))) {
      setMessage('请填写完整的子路径，或删除空规则')
      return
    }
    saveMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      sources: sources.flatMap((source) => {
        const permission = sourcePermissions[source.key]
        return permission ? [{
          source_key: source.key,
          permission,
          path_rules: (sourcePathRules[source.key] ?? []).map(({ path_prefix, permission: pathPermission }) => ({
            path_prefix: path_prefix.trim(),
            permission: pathPermission,
          })),
        }] : []
      }),
      user_ids: userIDs,
    })
  }

  const assignableUsers = users.filter((user) => user.role !== 'super_admin')
  return (
    <DialogWrap
      open={open}
      onOpenChange={onOpenChange}
      title={policy ? '编辑访问策略' : '新建访问策略'}
      description="先设置存储源默认权限，再按需用最长路径前缀覆盖子目录权限。"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={saveMutation.isPending || !name.trim()} onClick={save}>
            {saveMutation.isPending ? '保存中…' : '保存策略'}
          </Button>
        </>
      }
    >
      <FormField label="策略名称" required>
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：内容团队"
        />
      </FormField>
      <FormField label="说明" hint="说明策略适用的人群或用途">
        <Textarea
          className={css.formTextarea}
          rows={4}
          resize="vertical"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="例如：内容团队日常读写权限"
        />
      </FormField>
      <FormField label="存储源规则" hint="未选中的存储源不授权；子路径使用源内相对路径，不以 / 开头">
        <div className={css.policyEditorList}>
          {sources.length === 0 ? <p className={css.policyEditorEmpty}>请先创建存储源。</p> : null}
          {sources.map((source) => {
            const permission = sourcePermissions[source.key]
            const pathRules = sourcePathRules[source.key] ?? []
            return (
              <div key={source.key} className={css.policySourceBlock}>
                <div className={css.policyEditorRow}>
                  <Checkbox
                    className={css.policyEditorIdentity}
                    checked={!!permission}
                    onChange={(_, data) => toggleSource(source.key, !!data.checked)}
                    label={(
                      <span>
                        {source.name}
                        {source.is_disabled ? <span className={css.policyEditorMeta}> · 已禁用</span> : null}
                      </span>
                    )}
                  />
                  {permission ? (
                    <Select
                      value={permission}
                      onValueChange={(value) => setSourcePermissions((current) => ({
                        ...current,
                        [source.key]: value as AccessPermission,
                      }))}
                      options={[
                        { value: 'read_only', label: '默认只读' },
                        { value: 'read_write', label: '默认读写' },
                      ]}
                      ariaLabel={`${source.name}默认权限`}
                      width="content"
                    />
                  ) : null}
                </div>
                {permission ? (
                  <div className={css.policyPathRules}>
                    {pathRules.map((pathRule) => (
                      <div key={pathRule.id} className={css.policyPathRuleRow}>
                        <Input
                          value={pathRule.path_prefix}
                          onChange={(event) => updatePathRule(source.key, pathRule.id, { path_prefix: event.target.value })}
                          placeholder="例如：team/drafts"
                          aria-label={`${source.name}子路径`}
                        />
                        <Select
                          value={pathRule.permission}
                          onValueChange={(value) => updatePathRule(source.key, pathRule.id, {
                            permission: value as AccessPermission,
                          })}
                          options={[
                            { value: 'read_only', label: '只读' },
                            { value: 'read_write', label: '读写' },
                          ]}
                          ariaLabel={`${pathRule.path_prefix || source.name}子路径权限`}
                          width="content"
                        />
                        <Button
                          variant="ghost"
                          aria-label={`删除 ${source.name} 子路径规则`}
                          onClick={() => removePathRule(source.key, pathRule.id)} icon={<IconTrash size={14} />} />
                      </div>
                    ))}
                    <Button variant="ghost" onClick={() => addPathRule(source.key)} icon={<IconPlus size={14} />}>添加子路径覆盖</Button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </FormField>
      <FormField label="绑定用户" hint="超级管理员无需绑定，始终拥有全部读写权限">
        <div className={css.policyEditorList}>
          {assignableUsers.length === 0 ? <p className={css.policyEditorEmpty}>还没有可绑定的普通用户。</p> : null}
          {assignableUsers.map((user) => (
            <div key={user.id} className={css.policyEditorRow}>
              <Checkbox
                className={css.policyEditorIdentity}
                checked={userIDs.includes(user.id)}
                onChange={(_, data) => toggleUser(user.id, !!data.checked)}
                label={user.display_name || user.username}
              />
              <span className={css.policyEditorMeta}>@{user.username}</span>
            </div>
          ))}
        </div>
      </FormField>
      {message ? <Banner intent="error">{message}</Banner> : null}
    </DialogWrap>
  )
}
