import { Radio, RadioGroup } from '@fluentui/react-components'
import { THEME_OPTIONS, THEME_PREFERENCES_LABEL } from '../../../components/theme/themeOptions'
import { isThemeMode } from '../../../utils/themeMode'
import { setThemeMode, useTheme } from '../../../utils/useTheme'
import { IconSettings } from '../../../components/ui/Icon'
import { SectionCard } from '../SectionCard'

export function PreferencesSection() {
  const { mode } = useTheme()
  return (
    <SectionCard
      icon={<IconSettings size={18} />}
      tone="brand"
      title="外观"
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
    </SectionCard>
  )
}
