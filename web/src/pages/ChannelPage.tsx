import { useState } from "react"
import { Link } from "react-router-dom"

import { alignSequences } from "@/lib/align"
import { applyChannel } from "@/lib/api"
import { describeError, type ErrorDescription } from "@/lib/errors"
import { fmtInt, fmtPct } from "@/lib/format"
import { useSession } from "@/lib/session"
import {
  CHANNEL_PRESETS,
  type ChannelPresetName,
  type ChannelSettings,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Page } from "@/components/common/Page"
import { EmptyState, ErrorNote } from "@/components/common/EmptyState"
import { SequenceTrack } from "@/components/dna/SequenceTrack"

type Values = { sub: number; ins: number; del: number; dropout: number }

const PRESET_ORDER: ChannelPresetName[] = ["clean", "realistic", "harsh"]

function percentValues(name: ChannelPresetName): Values {
  const preset = CHANNEL_PRESETS[name]
  return {
    sub: preset.sub * 100,
    ins: preset.ins * 100,
    del: preset.del * 100,
    dropout: preset.dropout * 100,
  }
}

function presetFor(values: Values): ChannelPresetName | "custom" {
  for (const name of PRESET_ORDER) {
    const preset = percentValues(name)
    if (
      Math.abs(preset.sub - values.sub) < 1e-9 &&
      Math.abs(preset.ins - values.ins) < 1e-9 &&
      Math.abs(preset.del - values.del) < 1e-9 &&
      Math.abs(preset.dropout - values.dropout) < 1e-9
    ) {
      return name
    }
  }
  return "custom"
}

function RateControl({
  id,
  label,
  value,
  max,
  step,
  display,
  onChange,
}: {
  id: string
  label: string
  value: number
  max: number
  step: number
  display: string
  onChange: (next: number) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span id={`${id}-label`} className="label">
          {label}
        </span>
        <span className="num text-[11px] text-ink">{display}</span>
      </div>
      <Slider
        aria-label={`${label} rate`}
        className="mt-2.5"
        min={0}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(next[0] ?? 0)}
      />
    </div>
  )
}

export function ChannelPage() {
  const { artifact, setArtifact, isStale, markStale } = useSession()
  const initialValues: Values = artifact
    ? {
        sub: artifact.channel.sub * 100,
        ins: artifact.channel.ins * 100,
        del: artifact.channel.del * 100,
        dropout: artifact.channel.dropout * 100,
      }
    : percentValues("clean")

  const [values, setValues] = useState<Values>(initialValues)
  const [preset, setPreset] = useState<ChannelPresetName | "custom">(() =>
    presetFor(initialValues),
  )
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorDescription | null>(null)

  function change(patch: Partial<Values>) {
    const next = { ...values, ...patch }
    setValues(next)
    setPreset(presetFor(next))
    setDirty(true)
    setError(null)
    markStale(["noisy_strands", "recovery", "verification"])
  }

  function choosePreset(name: ChannelPresetName) {
    const next = percentValues(name)
    setValues(next)
    setPreset(name)
    setDirty(true)
    setError(null)
    markStale(["noisy_strands", "recovery", "verification"])
  }

  async function submit() {
    if (busy) return
    setBusy(true)
    setError(null)
    const settings: ChannelSettings = {
      sub: values.sub / 100,
      ins: values.ins / 100,
      del: values.del / 100,
      dropout: values.dropout / 100,
      seed: 1,
    }
    try {
      const next = await applyChannel(settings)
      setArtifact(next, ["recovery", "verification"])
      setDirty(false)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  const noisy = artifact?.noisy_strands ?? []
  const survivors = noisy.filter((strand) => strand.survived)
  const ntOut = survivors.reduce((sum, strand) => sum + strand.seq.length, 0)
  const showResult = Boolean(artifact?.channel.applied) && !dirty
  const staleNoise = isStale("noisy_strands")
  const diffStrand = survivors
    .map((strand) => ({
      noisy: strand,
      original: artifact?.strands.find((item) => item.index === strand.index),
    }))
    .find(
      (pair) =>
        pair.original && pair.noisy.seq !== pair.original.seq,
    ) ?? {
      noisy: survivors[0],
      original: artifact?.strands.find((item) => item.index === survivors[0]?.index),
    }

  return (
    <Page
      step="Step 2 / Channel"
      title="Damage the archive"
      description="A symmetric per-nucleotide channel: substitution, then insertion, then deletion, then whole-strand dropout. The seed and the preset numbers are fixed, so a run is reproducible."
    >
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="min-w-0"
          aria-label="Channel parameters"
        >
          <div className="flex items-baseline justify-between gap-4">
            <span className="label">Preset</span>
            <span className="num text-[10.5px] text-ink-muted">preset: {preset}</span>
          </div>
          <div
            role="group"
            aria-label="Channel preset"
            className="mt-1.5 flex border border-rule"
          >
            {PRESET_ORDER.map((name, index) => (
              <button
                key={name}
                type="button"
                aria-pressed={preset === name}
                aria-label={name[0].toUpperCase() + name.slice(1)}
                onClick={() => choosePreset(name)}
                className={cn(
                  "flex-1 px-2 py-1.5 text-[11.5px] capitalize transition-colors",
                  index > 0 && "border-l border-rule",
                  preset === name
                    ? "bg-ink text-paper"
                    : "bg-paper text-ink-muted hover:text-ink",
                )}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-5">
            <RateControl
              id="sub"
              label="Substitution"
              value={values.sub}
              max={3}
              step={0.1}
              display={`${values.sub.toFixed(2)}%`}
              onChange={(next) => change({ sub: next })}
            />
            <RateControl
              id="ins"
              label="Insertion"
              value={values.ins}
              max={3}
              step={0.1}
              display={`${values.ins.toFixed(2)}%`}
              onChange={(next) => change({ ins: next })}
            />
            <RateControl
              id="del"
              label="Deletion"
              value={values.del}
              max={3}
              step={0.1}
              display={`${values.del.toFixed(2)}%`}
              onChange={(next) => change({ del: next })}
            />
            <RateControl
              id="dropout"
              label="Strand dropout"
              value={values.dropout}
              max={50}
              step={1}
              display={`${values.dropout.toFixed(0)}%`}
              onChange={(next) => change({ dropout: next })}
            />
          </div>

          <div className="mt-4 flex items-baseline justify-between gap-4">
            <span className="label">Seed</span>
            <span className="num text-[11px] text-ink">1</span>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={busy || !artifact}
            className="mt-4 h-9 w-full rounded-none text-[12.5px]"
          >
            {busy ? "Applying…" : "Apply channel"}
          </Button>

          {!artifact ? (
            <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
              <Link to="/encode" className="underline decoration-rule underline-offset-2">
                1 Encode
              </Link>{" "}
              a file first; the channel edits the active strands.
            </p>
          ) : null}

          {error ? (
            <div className="mt-4">
              <ErrorNote message={error.message} hint={error.hint} />
            </div>
          ) : null}
        </form>

        <section aria-labelledby="channel-result" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <h2 id="channel-result" className="label">
              Result
            </h2>
            <span className="num text-[10.5px] text-ink-muted">one strand, aligned</span>
          </div>

          {!artifact ? (
            <div className="mt-3">
              <EmptyState title="No artifact to damage">
                Encode a file on{" "}
                <Link to="/encode" className="text-ink underline decoration-rule underline-offset-2">
                  1 Encode
                </Link>{" "}
                first. The channel reports survival and a single-strand before/after alignment.
              </EmptyState>
            </div>
          ) : dirty || staleNoise ? (
            <div className="mt-3">
              <EmptyState title="Channel parameters changed">
                Apply the channel to regenerate the alignment. Recovery and verification from the
                previous run are marked stale and will not be reused.
              </EmptyState>
            </div>
          ) : !showResult ? (
            <div className="mt-3">
              <EmptyState title="No channel applied">
                Set the four rates and press Apply channel. The summary reports strand survival and
                nucleotide count; the track shows one edited strand.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-3">
              <p className="num text-[13px] leading-relaxed text-ink">
                {fmtInt(survivors.length)} / {fmtInt(artifact.strands.length)} strands survive ·{" "}
                {fmtInt(artifact.stats.nt_total)} → {fmtInt(ntOut)} nt
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-ink-muted">
                Rates: substitution {fmtPct(artifact.channel.sub, 2)} · insertion{" "}
                {fmtPct(artifact.channel.ins, 2)} · deletion {fmtPct(artifact.channel.del, 2)} ·
                dropout {fmtPct(artifact.channel.dropout, 0)}. Seed {artifact.channel.seed}.
              </p>

              {diffStrand.noisy && diffStrand.original ? (
                (() => {
                  const alignment = alignSequences(
                    diffStrand.original.seq,
                    diffStrand.noisy.seq,
                  )
                  const substitutions = alignment.changed.reduce(
                    (count, changed, index) =>
                      changed &&
                      alignment.before[index] !== "-" &&
                      alignment.after[index] !== "-"
                        ? count + 1
                        : count,
                    0,
                  )
                  const insertions = Array.from(alignment.before).filter(
                    (base) => base === "-",
                  ).length
                  const deletions = Array.from(alignment.after).filter(
                    (base) => base === "-",
                  ).length
                  return (
                    <div className="mt-5">
                      <SequenceTrack
                        label={`strand ${diffStrand.original.index}`}
                        meta={`${substitutions} sub · ${insertions} ins · ${deletions} del`}
                        diff={alignment}
                      />
                      <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
                        Changed bases are filled in the damaged colour; a dot is a gap created by
                        an insertion or deletion. The backend reports full statistics.
                      </p>
                    </div>
                  )
                })()
              ) : (
                <div className="mt-5">
                  <EmptyState title="No strand survived">
                    Dropout removed every strand at this rate. Lower dropout and apply again.
                  </EmptyState>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
