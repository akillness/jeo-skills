# Local Setup & Development

## Development Setup

To set up the project locally for development or testing:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/DavidHDev/react-bits.git
   cd react-bits
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   This runs both the `jsrepo` registry builder in watch mode and the Vite development server concurrently.

4. **Open the browser**:
   Navigate to `http://localhost:5173` to view the documentation and interactive component showcase.

## Available Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `concurrently ...` | Runs registry builder in watch mode and Vite dev server |
| `build` | `npm run registry:build && ...` | Builds registry, generates LLM text, sitemap, and builds Vite site |
| `new:component` | `node scripts/generateComponent.js` | Scaffolds a new component template |
| `lint` | `eslint . ...` | Lints the codebase |
| `format` | `prettier --write .` | Formats all files |
