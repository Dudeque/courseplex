import {
  CourseLibraryState,
  ScannedCourse,
  ScannedCluster,
  StudySession,
} from '@/types/course';

export function createDemoLibraryState(): CourseLibraryState {
  const today = new Date();
  const sessions: StudySession[] = [];

  // Generate 60 days of realistic study sessions for the heatmap
  for (let i = 0; i < 90; i++) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    // Skips some days to look like natural GitHub contribution graph
    if ((i * 7 + 3) % 5 === 0) continue;

    const dateStr = d.toISOString().slice(0, 10);
    const minutes = 20 + ((i * 13) % 65);
    const speed = 1.25 + ((i % 3) * 0.25);

    sessions.push({
      id: `session-${dateStr}-${i}`,
      date: dateStr,
      coursePath: 'Frontend/Next.js Full-Stack Architecture',
      lessonPath: 'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/01 - Server Components Deep Dive.mp4',
      realMinutesSpent: minutes,
      contentMinutesCovered: Math.round(minutes * speed),
    });
  }

  return {
    version: 1,
    lastSyncedAt: new Date().toISOString(),
    dailyGoalMinutes: 45,
    clusters: {
      'cluster-frontend': {
        id: 'cluster-frontend',
        name: 'Frontend Engineering',
        color: '#6366f1',
        description: 'Modern full-stack web applications, React server components and browser performance',
        coursePaths: [
          'Frontend/Next.js Full-Stack Architecture',
          'Frontend/Advanced TypeScript Masterclass',
        ],
      },
      'cluster-systems': {
        id: 'cluster-systems',
        name: 'Systems & Backend',
        color: '#10b981',
        description: 'Distributed systems, database indexing, and event-driven architecture',
        coursePaths: [
          'Backend/Distributed Systems & Microservices',
        ],
      },
      'cluster-ai': {
        id: 'cluster-ai',
        name: 'AI & Machine Learning',
        color: '#ec4899',
        description: 'LLM agents, vector embeddings, and real-time inference pipelines',
        coursePaths: [
          'AI/Practical LLM Application Engineering',
        ],
      },
    },
    courses: {
      'Frontend/Next.js Full-Stack Architecture': {
        coursePath: 'Frontend/Next.js Full-Stack Architecture',
        customTitle: 'Next.js Full-Stack Architecture',
        clusterIds: ['cluster-frontend'],
        tags: ['React', 'Next.js', 'Turbopack', 'Vercel'],
        isFavorite: true,
        isArchived: false,
        status: 'in_progress',
        lastAccessedAt: new Date().toISOString(),
        lastWatchedLessonPath:
          'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/02 - Server Actions & Mutation Workflows.mp4',
        rating: 5,
      },
      'Frontend/Advanced TypeScript Masterclass': {
        coursePath: 'Frontend/Advanced TypeScript Masterclass',
        customTitle: 'Advanced TypeScript Masterclass',
        clusterIds: ['cluster-frontend'],
        tags: ['TypeScript', 'Generics', 'Type System'],
        isFavorite: false,
        isArchived: false,
        status: 'in_progress',
        lastAccessedAt: new Date(Date.now() - 86400000).toISOString(),
        lastWatchedLessonPath:
          'Frontend/Advanced TypeScript Masterclass/01 - Type Level Programming/01 - Conditional Types & Infer.mp4',
        rating: 4,
      },
      'Backend/Distributed Systems & Microservices': {
        coursePath: 'Backend/Distributed Systems & Microservices',
        customTitle: 'Distributed Systems & Microservices',
        clusterIds: ['cluster-systems'],
        tags: ['Distributed Systems', 'Kafka', 'Consensus', 'Raft'],
        isFavorite: true,
        isArchived: false,
        status: 'not_started',
        rating: 5,
      },
      'AI/Practical LLM Application Engineering': {
        coursePath: 'AI/Practical LLM Application Engineering',
        customTitle: 'Practical LLM Application Engineering',
        clusterIds: ['cluster-ai'],
        tags: ['AI', 'LLM', 'Agents', 'RAG'],
        isFavorite: false,
        isArchived: false,
        status: 'completed',
        rating: 5,
      },
    },
    progress: {
      'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/01 - Server Components Deep Dive.mp4': {
        lessonPath:
          'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/01 - Server Components Deep Dive.mp4',
        coursePath: 'Frontend/Next.js Full-Stack Architecture',
        currentTimeSeconds: 840,
        durationSeconds: 840,
        completed: true,
        completedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        watchCount: 2,
        lastWatchedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/02 - Server Actions & Mutation Workflows.mp4': {
        lessonPath:
          'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/02 - Server Actions & Mutation Workflows.mp4',
        coursePath: 'Frontend/Next.js Full-Stack Architecture',
        currentTimeSeconds: 412,
        durationSeconds: 980,
        completed: false,
        watchCount: 1,
        lastWatchedAt: new Date().toISOString(),
      },
      'Frontend/Advanced TypeScript Masterclass/01 - Type Level Programming/01 - Conditional Types & Infer.mp4': {
        lessonPath:
          'Frontend/Advanced TypeScript Masterclass/01 - Type Level Programming/01 - Conditional Types & Infer.mp4',
        coursePath: 'Frontend/Advanced TypeScript Masterclass',
        currentTimeSeconds: 260,
        durationSeconds: 720,
        completed: false,
        watchCount: 1,
        lastWatchedAt: new Date(Date.now() - 86400000).toISOString(),
      },
    },
    notes: {
      'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/02 - Server Actions & Mutation Workflows.mp4': [
        {
          id: 'note-1',
          lessonPath:
            'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/02 - Server Actions & Mutation Workflows.mp4',
          coursePath: 'Frontend/Next.js Full-Stack Architecture',
          timestampSeconds: 145,
          contentMarkdown:
            '**Key Rule:** Never expose raw internal database IDs in client payloads. Always validate with a schema validator like Zod inside the server action boundary before mutations.\n\n```typescript\n"use server";\nexport async function updateProfile(data: unknown) {\n  const parsed = ProfileSchema.parse(data);\n  // Safe mutation here\n}\n```',
          tags: ['security', 'validation', 'server-actions'],
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          updatedAt: new Date(Date.now() - 7200000).toISOString(),
        },
        {
          id: 'note-2',
          lessonPath:
            'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/02 - Server Actions & Mutation Workflows.mp4',
          coursePath: 'Frontend/Next.js Full-Stack Architecture',
          timestampSeconds: 380,
          contentMarkdown:
            'Optimistic updates with `useOptimistic`: update UI immediately before server roundtrip finishes, rolling back if error is thrown.',
          tags: ['react', 'ux'],
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
      'Frontend/Advanced TypeScript Masterclass/01 - Type Level Programming/01 - Conditional Types & Infer.mp4': [
        {
          id: 'note-3',
          lessonPath:
            'Frontend/Advanced TypeScript Masterclass/01 - Type Level Programming/01 - Conditional Types & Infer.mp4',
          coursePath: 'Frontend/Advanced TypeScript Masterclass',
          timestampSeconds: 95,
          contentMarkdown:
            'Unpacking promise return type with `infer`:\n```typescript\ntype AwaitedReturn<T> = T extends (...args: any[]) => Promise<infer R> ? R : never;\n```',
          tags: ['typescript', 'infer', 'generics'],
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
    },
    studySessions: sessions,
  };
}

export function createDemoScannedData(): {
  courses: ScannedCourse[];
  clusters: ScannedCluster[];
} {
  const courses: ScannedCourse[] = [
    {
      id: 'course-nextjs-arch',
      title: 'Next.js Full-Stack Architecture',
      rawTitle: 'Next.js Full-Stack Architecture',
      relativePath: 'Frontend/Next.js Full-Stack Architecture',
      clusterId: 'cluster-frontend',
      clusterName: 'Frontend Engineering',
      coverUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=80',
      totalLessons: 6,
      totalDurationSeconds: 4320,
      description: 'Master server components, streaming SSR, server actions, and high performance edge caching.',
      modules: [
        {
          id: 'mod-01-core',
          title: 'Core Foundations & Mental Model',
          rawTitle: '01 - Core Foundations',
          orderIndex: 1,
          relativePath: 'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations',
          lessons: [
            {
              id: 'les-next-01',
              title: 'Server Components Deep Dive & Serialization Tree',
              rawTitle: '01 - Server Components Deep Dive.mp4',
              orderIndex: 1,
              relativePath: 'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/01 - Server Components Deep Dive.mp4',
              coursePath: 'Frontend/Next.js Full-Stack Architecture',
              modulePath: 'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations',
              isVideo: true,
              isResourceOnly: false,
              durationSeconds: 840,
              attachments: [
                {
                  name: 'RSC-Mental-Model-Architecture-Cheatsheet.pdf',
                  type: 'pdf',
                  relativePath: 'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/RSC-Mental-Model-Architecture-Cheatsheet.pdf',
                },
                {
                  name: 'server-components-code.zip',
                  type: 'zip',
                  relativePath: 'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/server-components-code.zip',
                },
              ],
            },
            {
              id: 'les-next-02',
              title: 'Server Actions & Mutation Workflows',
              rawTitle: '02 - Server Actions & Mutation Workflows.mp4',
              orderIndex: 2,
              relativePath: 'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/02 - Server Actions & Mutation Workflows.mp4',
              coursePath: 'Frontend/Next.js Full-Stack Architecture',
              modulePath: 'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations',
              isVideo: true,
              isResourceOnly: false,
              durationSeconds: 980,
              attachments: [
                {
                  name: 'server-actions-best-practices.md',
                  type: 'doc',
                  relativePath: 'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/server-actions-best-practices.md',
                },
              ],
            },
            {
              id: 'les-next-03',
              title: 'Streaming SSR, Suspense Boundaries & Parallel Data Fetching',
              rawTitle: '03 - Streaming SSR & Suspense.mp4',
              orderIndex: 3,
              relativePath: 'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations/03 - Streaming SSR & Suspense.mp4',
              coursePath: 'Frontend/Next.js Full-Stack Architecture',
              modulePath: 'Frontend/Next.js Full-Stack Architecture/01 - Core Foundations',
              isVideo: true,
              isResourceOnly: false,
              durationSeconds: 760,
              attachments: [],
            },
          ],
        },
        {
          id: 'mod-02-perf',
          title: 'Caching Strategies & Production Deployment',
          rawTitle: '02 - Caching & Production',
          orderIndex: 2,
          relativePath: 'Frontend/Next.js Full-Stack Architecture/02 - Caching & Production',
          lessons: [
            {
              id: 'les-next-04',
              title: 'Unraveling the 4 Caching Layers in Next.js',
              rawTitle: '01 - Unraveling Caching Layers.mp4',
              orderIndex: 1,
              relativePath: 'Frontend/Next.js Full-Stack Architecture/02 - Caching & Production/01 - Unraveling Caching Layers.mp4',
              coursePath: 'Frontend/Next.js Full-Stack Architecture',
              modulePath: 'Frontend/Next.js Full-Stack Architecture/02 - Caching & Production',
              isVideo: true,
              isResourceOnly: false,
              durationSeconds: 920,
              attachments: [],
            },
            {
              id: 'les-next-05',
              title: 'Fine-Tuned Revalidation via Tags & Path Invalidation',
              rawTitle: '02 - Fine-Tuned Revalidation.mp4',
              orderIndex: 2,
              relativePath: 'Frontend/Next.js Full-Stack Architecture/02 - Caching & Production/02 - Fine-Tuned Revalidation.mp4',
              coursePath: 'Frontend/Next.js Full-Stack Architecture',
              modulePath: 'Frontend/Next.js Full-Stack Architecture/02 - Caching & Production',
              isVideo: true,
              isResourceOnly: false,
              durationSeconds: 820,
              attachments: [],
            },
          ],
        },
      ],
    },
    {
      id: 'course-typescript-mastery',
      title: 'Advanced TypeScript Masterclass',
      rawTitle: 'Advanced TypeScript Masterclass',
      relativePath: 'Frontend/Advanced TypeScript Masterclass',
      clusterId: 'cluster-frontend',
      clusterName: 'Frontend Engineering',
      coverUrl: 'https://images.unsplash.com/photo-1516116211227-bbc0429f4b75?w=800&auto=format&fit=crop&q=80',
      totalLessons: 4,
      totalDurationSeconds: 3200,
      description: 'Master mapped types, template literal types, conditional inference, and compiler magic.',
      modules: [
        {
          id: 'mod-ts-01',
          title: 'Type Level Programming',
          rawTitle: '01 - Type Level Programming',
          orderIndex: 1,
          relativePath: 'Frontend/Advanced TypeScript Masterclass/01 - Type Level Programming',
          lessons: [
            {
              id: 'les-ts-01',
              title: 'Conditional Types & Infer In Depth',
              rawTitle: '01 - Conditional Types & Infer.mp4',
              orderIndex: 1,
              relativePath: 'Frontend/Advanced TypeScript Masterclass/01 - Type Level Programming/01 - Conditional Types & Infer.mp4',
              coursePath: 'Frontend/Advanced TypeScript Masterclass',
              modulePath: 'Frontend/Advanced TypeScript Masterclass/01 - Type Level Programming',
              isVideo: true,
              isResourceOnly: false,
              durationSeconds: 720,
              attachments: [
                {
                  name: 'type-challenges-exercises.ts',
                  type: 'code',
                  relativePath: 'Frontend/Advanced TypeScript Masterclass/01 - Type Level Programming/type-challenges-exercises.ts',
                },
              ],
            },
            {
              id: 'les-ts-02',
              title: 'Template Literal Types for Type-Safe DSLs',
              rawTitle: '02 - Template Literal Types.mp4',
              orderIndex: 2,
              relativePath: 'Frontend/Advanced TypeScript Masterclass/01 - Type Level Programming/02 - Template Literal Types.mp4',
              coursePath: 'Frontend/Advanced TypeScript Masterclass',
              modulePath: 'Frontend/Advanced TypeScript Masterclass/01 - Type Level Programming',
              isVideo: true,
              isResourceOnly: false,
              durationSeconds: 840,
              attachments: [],
            },
          ],
        },
      ],
    },
    {
      id: 'course-dist-systems',
      title: 'Distributed Systems & Microservices',
      rawTitle: 'Distributed Systems & Microservices',
      relativePath: 'Backend/Distributed Systems & Microservices',
      clusterId: 'cluster-systems',
      clusterName: 'Systems & Backend',
      coverUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format&fit=crop&q=80',
      totalLessons: 5,
      totalDurationSeconds: 5100,
      description: 'Consensus algorithms, Raft, Kafka event-driven pipelines, and high availability database clustering.',
      modules: [
        {
          id: 'mod-dist-01',
          title: 'Consensus & State Replication',
          rawTitle: '01 - Consensus & State Replication',
          orderIndex: 1,
          relativePath: 'Backend/Distributed Systems & Microservices/01 - Consensus & State Replication',
          lessons: [
            {
              id: 'les-dist-01',
              title: 'The CAP Theorem & Modern PACELC Principles',
              rawTitle: '01 - The CAP Theorem.mp4',
              orderIndex: 1,
              relativePath: 'Backend/Distributed Systems & Microservices/01 - Consensus & State Replication/01 - The CAP Theorem.mp4',
              coursePath: 'Backend/Distributed Systems & Microservices',
              modulePath: 'Backend/Distributed Systems & Microservices/01 - Consensus & State Replication',
              isVideo: true,
              isResourceOnly: false,
              durationSeconds: 1100,
              attachments: [],
            },
          ],
        },
      ],
    },
    {
      id: 'course-llm-eng',
      title: 'Practical LLM Application Engineering',
      rawTitle: 'Practical LLM Application Engineering',
      relativePath: 'AI/Practical LLM Application Engineering',
      clusterId: 'cluster-ai',
      clusterName: 'AI & Machine Learning',
      coverUrl: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=80',
      totalLessons: 4,
      totalDurationSeconds: 3800,
      description: 'Building autonomous AI agents, tool calling, retrieval augmented generation and low latency streaming.',
      modules: [
        {
          id: 'mod-llm-01',
          title: 'Agentic Architectures & Tool Use',
          rawTitle: '01 - Agentic Architectures',
          orderIndex: 1,
          relativePath: 'AI/Practical LLM Application Engineering/01 - Agentic Architectures',
          lessons: [
            {
              id: 'les-llm-01',
              title: 'Multi-Agent Tool Orchestration & Guardrails',
              rawTitle: '01 - Tool Orchestration.mp4',
              orderIndex: 1,
              relativePath: 'AI/Practical LLM Application Engineering/01 - Agentic Architectures/01 - Tool Orchestration.mp4',
              coursePath: 'AI/Practical LLM Application Engineering',
              modulePath: 'AI/Practical LLM Application Engineering/01 - Agentic Architectures',
              isVideo: true,
              isResourceOnly: false,
              durationSeconds: 950,
              attachments: [],
            },
          ],
        },
      ],
    },
  ];

  const clusters: ScannedCluster[] = [
    {
      id: 'cluster-frontend',
      name: 'Frontend Engineering',
      relativePath: 'Frontend',
      color: '#6366f1',
      coursePaths: [
        'Frontend/Next.js Full-Stack Architecture',
        'Frontend/Advanced TypeScript Masterclass',
      ],
    },
    {
      id: 'cluster-systems',
      name: 'Systems & Backend',
      relativePath: 'Backend',
      color: '#10b981',
      coursePaths: [
        'Backend/Distributed Systems & Microservices',
      ],
    },
    {
      id: 'cluster-ai',
      name: 'AI & Machine Learning',
      relativePath: 'AI',
      color: '#ec4899',
      coursePaths: [
        'AI/Practical LLM Application Engineering',
      ],
    },
  ];

  return { courses, clusters };
}
