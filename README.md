# Exam

Static quiz sites served by GitHub Pages. Each quiz is a self-contained folder `<course>/<exam>/`; the root `index.html` routes `#/<course>/<exam>` to it.

- `https://minux-lee.github.io/Exam/#/cs30300/midterm`
- Add a quiz: `./publish.sh <quiz-dir> <course>/<exam>`, then add it to `QUIZZES` in `index.html`.
- Progress is stored in each browser's `localStorage`, keyed per `<course>/<exam>`.
