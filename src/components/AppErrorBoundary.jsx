import { Component } from 'react'

export class AppErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    console.error('Unexpected PawOps rendering error', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-3 px-6 py-12 text-[#1d2a22]">
        <p className="font-bold text-[#c62828]">PawOps</p>
        <h1 className="text-3xl font-bold">Something went wrong while displaying this page.</h1>
        <p className="text-[#5f6b64]">Your data has not been changed. Try again or return to the dashboard.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="rounded-lg bg-[#2bae66] px-5 py-3 font-bold text-white" onClick={() => this.setState({ failed: false })}>Try again</button>
          <a className="rounded-lg border border-[#d9c9c7] bg-white px-5 py-3 font-bold text-[#1d2a22] no-underline" href="/dashboard">Back to dashboard</a>
        </div>
      </main>
    )
  }
}

