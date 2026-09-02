import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import RagPipelineFlow from './RagPipelineFlow'

const DETAILS = {
  chunking: [
    ['Strategy', 'fixed'],
    ['Chunk size', '500 chars'],
  ],
  documents: [['Documents indexed', 2]],
}

function detailPanel(container) {
  return within(container.querySelector('.pipeline-flow-detail'))
}

describe('RagPipelineFlow', () => {
  it('shows a hint before any stage is selected', () => {
    const { container } = render(<RagPipelineFlow details={DETAILS} />)

    expect(
      detailPanel(container).getByText('Click a stage to see its current configuration.')
    ).toBeInTheDocument()
  })

  it('renders all twelve pipeline stage labels arranged across three rows', () => {
    const { container } = render(<RagPipelineFlow details={DETAILS} />)

    const labels = [
      'Documents',
      'Parsing',
      'Chunking',
      'Embedding',
      'Vector DB',
      'Query',
      'Hybrid Retrieval',
      'Reranking',
      'Context',
      'LLM',
      'Answer',
      'RAGAS Evaluation',
    ]

    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    expect(container.querySelectorAll('.blueprint-row')).toHaveLength(3)
    expect(container.querySelectorAll('.blueprint-node')).toHaveLength(12)
  })

  it('clicking a stage shows its real detail rows', async () => {
    const { container } = render(<RagPipelineFlow details={DETAILS} />)

    await userEvent.setup().click(screen.getByRole('button', { name: /Chunking/ }))

    const panel = detailPanel(container)
    expect(panel.getByText('Strategy')).toBeInTheDocument()
    expect(panel.getByText('fixed')).toBeInTheDocument()
    expect(panel.getByText('Chunk size')).toBeInTheDocument()
    expect(panel.getByText('500 chars')).toBeInTheDocument()
  })

  it('clicking the same stage twice deselects it', async () => {
    const { container } = render(<RagPipelineFlow details={DETAILS} />)
    const user = userEvent.setup()
    const chunkingNode = screen.getByRole('button', { name: /Chunking/ })

    await user.click(chunkingNode)
    expect(detailPanel(container).getByText('Strategy')).toBeInTheDocument()

    await user.click(chunkingNode)
    expect(
      detailPanel(container).getByText('Click a stage to see its current configuration.')
    ).toBeInTheDocument()
  })

  it('marks the selected stage as active', async () => {
    render(<RagPipelineFlow details={DETAILS} />)

    const button = screen.getByRole('button', { name: /Chunking/ })
    expect(button).not.toHaveClass('active')

    await userEvent.setup().click(button)
    expect(button).toHaveClass('active')
  })
})
