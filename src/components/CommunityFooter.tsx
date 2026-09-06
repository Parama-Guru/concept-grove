import { ArrowUp, BookOpen, Bug, GitPullRequest, Code, Star } from 'lucide-react'
import { version } from '../../package.json'
import './CommunityFooter.css'

const repository = 'https://github.com/Parama-Guru/concept-grove'

export default function CommunityFooter() {
  return (
    <footer className="community-footer" aria-label="Project and contribution links">
      <div className="footer-project">
        <div>
          <p><strong>Concept Grove</strong> <span className="footer-version">v{version}</span></p>
          <p>Open source. Made for curious minds. Help it grow.</p>
        </div>
        <a className="footer-star" href={repository} target="_blank" rel="noopener noreferrer"><Star size={16} aria-hidden="true" />Star on GitHub<span className="sr-only"> (opens in a new tab)</span></a>
      </div>
      <nav className="footer-links" aria-label="Contribute to Concept Grove">
        <a href={repository} target="_blank" rel="noopener noreferrer"><Code size={15} aria-hidden="true" />Source code</a>
        <a href={`${repository}/blob/main/CONTRIBUTING.md#adding-flashcards`} target="_blank" rel="noopener noreferrer"><BookOpen size={15} aria-hidden="true" />Add flashcards</a>
        <a href={`${repository}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer"><GitPullRequest size={15} aria-hidden="true" />Contribute a feature</a>
        <a href={`${repository}/issues/new/choose`} target="_blank" rel="noopener noreferrer"><Bug size={15} aria-hidden="true" />Report an issue</a>
      </nav>
      <div className="footer-bottom">
        <p>© 2026 Parama-Guru · <a href={`${repository}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">MIT License</a> · <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`} target="_blank" rel="noopener noreferrer">Third-party notices</a></p>
        <button className="text-button" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}><ArrowUp size={16} aria-hidden="true" /><span>Back to top</span></button>
      </div>
    </footer>
  )
}