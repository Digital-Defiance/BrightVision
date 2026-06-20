/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { TierModelGroup, type TierModelGroupProps } from './TierModelGroup'
import { ModelHopperEditor } from './ModelHopperEditor'
import type { ModelHopperEntry } from '../../theme/modelHopper'

const theme = createTheme({ palette: { mode: 'dark' } })

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

/** Helper to build a minimal entry for testing. */
function makeEntry(
  id: string,
  model: string,
  tier: 'fast' | 'code' | 'think',
  opts?: Partial<ModelHopperEntry>
): ModelHopperEntry {
  return {
    id,
    model,
    label: opts?.label ?? model,
    tier,
    enabled: opts?.enabled ?? true,
    tierSlot: opts?.tierSlot,
    priorityRank: opts?.priorityRank,
  }
}

describe('TierModelGroup', () => {
  const defaultProps: TierModelGroupProps = {
    tier: 'fast',
    entries: [
      makeEntry('f1', 'ollama_chat/model-a', 'fast', { label: 'Model A', tierSlot: 0 }),
      makeEntry('f2', 'ollama_chat/model-b', 'fast', { label: 'Model B', tierSlot: 1 }),
      makeEntry('f3', 'ollama_chat/model-c', 'fast', { label: 'Model C', tierSlot: 2 }),
    ],
    snapshot: {
      ollamaHost: 'http://127.0.0.1:11434',
      reachable: true,
      configuredTag: '',
      configuredInPs: false,
      tagsText: '',
      psText: '',
      tagsRows: [{ name: 'model-d' }, { name: 'model-e' }],
      backend: 'ollama',
    },
    onToggle: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    onReorder: vi.fn(),
    disabled: false,
  }

  it('renders tier heading and all model rows for a multi-model tier (Req 5.1)', () => {
    const { container } = renderWithTheme(<TierModelGroup {...defaultProps} />)

    // Tier heading is shown
    expect(container.querySelector('[data-testid="tier-model-group-fast"]')).toBeTruthy()
    expect(screen.getByText('Fast Tier')).toBeInTheDocument()
    expect(screen.getByText('(3 models)')).toBeInTheDocument()

    // All 3 model rows are rendered
    expect(container.querySelector('[data-testid="tier-model-row-f1"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="tier-model-row-f2"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="tier-model-row-f3"]')).toBeTruthy()

    // Labels are visible
    expect(screen.getByText('Model A')).toBeInTheDocument()
    expect(screen.getByText('Model B')).toBeInTheDocument()
    expect(screen.getByText('Model C')).toBeInTheDocument()
  })

  it('calls onToggle with correct args when enable switch is clicked (Req 5.1)', () => {
    const onToggle = vi.fn()
    const { container } = renderWithTheme(<TierModelGroup {...defaultProps} onToggle={onToggle} />)

    // MUI Switch: click the checkbox input inside the switch to trigger onChange
    const toggle = container.querySelector('[data-testid="tier-model-toggle-f2"]') as HTMLElement
    expect(toggle).toBeTruthy()
    const input = toggle.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(input).toBeTruthy()
    fireEvent.click(input)

    expect(onToggle).toHaveBeenCalledWith('f2', expect.any(Boolean))
  })

  it('calls onRemove when remove button is clicked (Req 5.4)', () => {
    const onRemove = vi.fn()
    const { container } = renderWithTheme(<TierModelGroup {...defaultProps} onRemove={onRemove} />)

    const removeBtns = container.querySelectorAll('[data-testid="tier-model-remove-f1"]')
    expect(removeBtns.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(removeBtns[0])

    expect(onRemove).toHaveBeenCalledWith('f1')
  })

  it('disables remove button for code tier with only 1 model (Req 5.4)', () => {
    const onRemove = vi.fn()
    const props: TierModelGroupProps = {
      ...defaultProps,
      tier: 'code',
      entries: [makeEntry('c1', 'ollama_chat/code-model', 'code', { label: 'Code Model' })],
    }
    const { container } = renderWithTheme(<TierModelGroup {...props} onRemove={onRemove} />)

    const removeBtn = container.querySelector('[data-testid="tier-model-remove-c1"]') as HTMLButtonElement
    expect(removeBtn).toBeTruthy()
    expect(removeBtn.disabled).toBe(true)

    fireEvent.click(removeBtn)
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('does NOT disable remove for code tier with multiple models', () => {
    const onRemove = vi.fn()
    const props: TierModelGroupProps = {
      ...defaultProps,
      tier: 'code',
      entries: [
        makeEntry('c1', 'ollama_chat/code-a', 'code', { label: 'Code A' }),
        makeEntry('c2', 'ollama_chat/code-b', 'code', { label: 'Code B' }),
      ],
    }
    const { container } = renderWithTheme(<TierModelGroup {...props} onRemove={onRemove} />)

    const removeBtn = container.querySelector('[data-testid="tier-model-remove-c1"]') as HTMLButtonElement
    expect(removeBtn).toBeTruthy()
    expect(removeBtn.disabled).toBe(false)
  })

  it('calls onAdd when a model is selected from the add dropdown (Req 5.3)', () => {
    const onAdd = vi.fn()
    const props: TierModelGroupProps = {
      ...defaultProps,
      onAdd,
      snapshot: {
        ollamaHost: 'http://127.0.0.1:11434',
        reachable: true,
        configuredTag: '',
        configuredInPs: false,
        tagsText: '',
        psText: '',
        tagsRows: [{ name: 'new-model-tag' }],
        backend: 'ollama',
      },
    }
    const { container } = renderWithTheme(<TierModelGroup {...props} />)

    // The add select should be visible since we have available models
    const addSelect = container.querySelector('[data-testid="tier-model-add-select-fast"]')
    expect(addSelect).toBeTruthy()

    // Open the select and choose the model via MUI Select
    const selectEl = addSelect!.querySelector('[role="combobox"]') as HTMLElement
    fireEvent.mouseDown(selectEl)

    // MUI renders menu items in a portal
    const menuItem = screen.getByText('new-model-tag')
    fireEvent.click(menuItem)

    expect(onAdd).toHaveBeenCalledTimes(1)
    const addedEntry = onAdd.mock.calls[0][0]
    expect(addedEntry.tier).toBe('fast')
    expect(addedEntry.model).toContain('new-model-tag')
    expect(addedEntry.enabled).toBe(true)
  })

  it('always shows add select with custom option when catalog is empty', () => {
    const onAdd = vi.fn()
    const { snapshot: _drop, ...rest } = defaultProps
    const props: TierModelGroupProps = {
      ...rest,
      onAdd,
      snapshot: {
        ollamaHost: 'http://127.0.0.1:11434',
        reachable: true,
        configuredTag: '',
        configuredInPs: false,
        tagsText: '',
        psText: '',
        tagsRows: [],
        backend: 'ollama',
      },
    }
    const { container } = renderWithTheme(<TierModelGroup {...props} />)

    const addSelect = container.querySelector('[data-testid="tier-model-add-select-fast"]')
    expect(addSelect).toBeTruthy()

    const selectEl = addSelect!.querySelector('[role="combobox"]') as HTMLElement
    fireEvent.mouseDown(selectEl)
    const customOption = screen
      .getAllByRole('option')
      .find((el) => el.getAttribute('data-value') === 'custom')
    expect(customOption).toBeTruthy()
    fireEvent.click(customOption!)

    expect(onAdd).toHaveBeenCalledTimes(1)
    const addedEntry = onAdd.mock.calls[0][0]
    expect(addedEntry.tier).toBe('fast')
    expect(addedEntry.model).toBe('')
  })

  it('renders correct tier labels for each tier type', () => {
    const tiers = ['fast', 'code', 'think'] as const
    const labels = ['Fast Tier', 'Code Tier', 'Think Tier']

    tiers.forEach((tier, i) => {
      const { container, unmount } = renderWithTheme(
        <TierModelGroup
          {...defaultProps}
          tier={tier}
          entries={[makeEntry('x', 'model', tier, { label: 'X' })]}
        />
      )
      expect(container.textContent).toContain(labels[i])
      unmount()
    })
  })

  it('shows singular "model" for single entry count', () => {
    const { container } = renderWithTheme(
      <TierModelGroup
        {...defaultProps}
        entries={[makeEntry('f1', 'model', 'fast', { label: 'Solo' })]}
      />
    )
    expect(container.textContent).toContain('(1 model)')
  })
})

describe('ModelHopperEditor — backward compat and multi-model detection', () => {
  it('renders flat layout (no TierModelGroup) for single-model entries without tierSlot (Req 7.3)', () => {
    const models: ModelHopperEntry[] = [
      makeEntry('f1', 'ollama_chat/fast-model', 'fast', { label: 'Fast' }),
      makeEntry('c1', '', 'code', { label: 'Session code' }),
      makeEntry('t1', 'ollama_chat/think-model', 'think', { label: 'Think' }),
    ]
    const onChange = vi.fn()

    const { container } = renderWithTheme(
      <ModelHopperEditor
        models={models}
        sessionModel="ollama_chat/qwen3.6:27b"
        onChange={onChange}
      />
    )

    // Flat layout rows exist (individual model-hopper-row- test ids)
    expect(container.querySelector('[data-testid="model-hopper-row-f1"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="model-hopper-row-c1"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="model-hopper-row-t1"]')).toBeTruthy()

    // Multi-model tiers section should NOT be rendered
    expect(container.querySelector('[data-testid="multi-model-tiers"]')).toBeNull()
  })

  it('renders TierModelGroup for multi-model tiers with tierSlot defined (Req 5.1)', () => {
    const models: ModelHopperEntry[] = [
      makeEntry('f1', 'ollama_chat/fast-a', 'fast', { tierSlot: 0, label: 'Fast A' }),
      makeEntry('f2', 'ollama_chat/fast-b', 'fast', { tierSlot: 1, label: 'Fast B' }),
      makeEntry('c1', '', 'code', { label: 'Code slot' }),
      makeEntry('t1', 'ollama_chat/think-a', 'think', { tierSlot: 0, label: 'Think A' }),
      makeEntry('t2', 'ollama_chat/think-b', 'think', { tierSlot: 1, label: 'Think B' }),
    ]
    const onChange = vi.fn()

    const { container } = renderWithTheme(
      <ModelHopperEditor
        models={models}
        sessionModel="ollama_chat/qwen3.6:27b"
        onChange={onChange}
      />
    )

    // Multi-model tiers section should be rendered
    expect(container.querySelector('[data-testid="multi-model-tiers"]')).toBeTruthy()

    // TierModelGroup components for fast and think tiers
    expect(container.querySelector('[data-testid="tier-model-group-fast"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="tier-model-group-think"]')).toBeTruthy()

    // Code tier with only 1 entry should NOT be grouped
    expect(container.querySelector('[data-testid="tier-model-group-code"]')).toBeNull()

    // The single code entry should be in the flat layout
    expect(container.querySelector('[data-testid="model-hopper-row-c1"]')).toBeTruthy()
  })

  it('does not render TierModelGroup when multi entries exist but no tierSlot', () => {
    // Two fast entries but none have tierSlot — NOT a multi-model tier from env sync
    const models: ModelHopperEntry[] = [
      makeEntry('f1', 'ollama_chat/fast-a', 'fast', { label: 'Fast A' }),
      makeEntry('f2', 'ollama_chat/fast-b', 'fast', { label: 'Fast B' }),
      makeEntry('c1', '', 'code', { label: 'Code' }),
    ]
    const onChange = vi.fn()

    const { container } = renderWithTheme(
      <ModelHopperEditor
        models={models}
        sessionModel="ollama_chat/qwen3.6:27b"
        onChange={onChange}
      />
    )

    // No multi-model tier grouping since tierSlot is not defined
    expect(container.querySelector('[data-testid="multi-model-tiers"]')).toBeNull()
    // Flat rows rendered
    expect(container.querySelector('[data-testid="model-hopper-row-f1"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="model-hopper-row-f2"]')).toBeTruthy()
  })
})
