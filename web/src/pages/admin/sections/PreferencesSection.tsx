import { Radio, RadioGroup } from '@fluentui/react-components'
import { THEME_OPTIONS, THEME_PREFERENCES_LABEL } from '../../../components/theme/themeOptions'
import { isThemeMode } from '../../../utils/themeMode'
import { setThemeMode, useTheme } from '../../../utils/useTheme'
import { IconSettings } from '../../../components/ui/Icon'
import { SectionCard } from '../SectionCard'
import { useStyles } from './preferences.styles'

export function PreferencesSection() {
  const css = useStyles()
  const { mode } = useTheme()
  return (
    <SectionCard
      icon={<IconSettings size={18} />}
      tone="brand"
      title="外观"
      hint="选择界面深浅模式；跟随系统时随操作系统自动切换。"
    >
      <RadioGroup
        aria-label={THEME_PREFERENCES_LABEL}
        layout="horizontal"
        value={mode}
        onChange={(_, data) => {
          if (isThemeMode(data.value)) setThemeMode(data.value)
        }}
      >
        {THEME_OPTIONS.map((option) => (
          // Radio 的主槽是隐藏 <input>(空元素),文案必须走 label 槽而不是 children。
          <Radio key={option.value} value={option.value} label={{ children: option.label }} />
        ))}
      </RadioGroup>
      <span className={css.kvLabel}>
        手动档位立即生效，并在登录后同步到账号，换设备后仍然保持。
      </span>
    </SectionCard>
  )
}
