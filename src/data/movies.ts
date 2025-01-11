//src/data/movies.ts
import { Movie } from '@/types/movie';

export const movies: Movie[] = [
  {
    id: 1,
    title: "The Shawshank Redemption",
    year: 1994,
    director: "Frank Darabont",
    genre: ["Drama"],
    rating: 9.3,
    r2_image_path: "/api/movie/shawshank.jpg",  // Path for the poster in R2
    r2_video_path: "api/movie/shawshank.mp4",    // Path for the movie file in R2
    r2_subtitles_path: "",
    description: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
    streamingUrl: "/api/stream/1"  // This will be handled by our new route
  },
  {
    id: 2,
    title: "The Godfather",
    year: 1972,
    director: "Francis Ford Coppola",
    genre: ["Crime", "Drama"],
    rating: 9.2,
    r2_image_path: "/api/movie/godfather_1.jpg",
    r2_video_path: "api/movie/godfather_1.mp4",
    r2_subtitles_path: "",
    description: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.",
    streamingUrl: "/api/stream/2"
  },
  {
    id: 3,
    title: "Come and See",
    year: 1985,
    director: "Elem Klimov",
    genre: ["War", "Horror"],
    rating: 9.2,
    r2_image_path: "/api/movie/come_and_see.jpg",
    r2_video_path: "api/movie/come_and_see.mp4",
    r2_subtitles_path: "subtitles-come_and_see.srt",
    description: "The invasion of a village in Byelorussia by German forces sends young Florya (Aleksey Kravchenko) into the forest to join the weary Resistance fighters, where his continued survival amidst the brutal debris of war becomes increasingly nightmarish.",
    streamingUrl: "/api/stream/3"
  },
  {
    id: 4,
    title: "Apocalypse Now",
    year: 1979,
    director: "Francis Ford Coppola",
    genre: ["War", "Drama"],
    rating: 9.2,
    r2_image_path: "/api/movie/apocalypse_now.jpg",
    r2_video_path: "api/movie/apocalypse_now.mp4",
    r2_subtitles_path: "subtitles-apocalypse_now.srt",
    description: "In Vietnam in 1970, Captain Willard (Martin Sheen) takes a perilous and increasingly hallucinatory journey upriver to find and terminate Colonel Kurtz (Marlon Brando), a once-promising officer who has reportedly gone completely mad.",
    streamingUrl: "/api/stream/4"
  },
  {
    id: 5,
    title: "Fantastic Mr. Fox",
    year: 2009,
    director: "Wes Anderson",
    genre: ["Comedy", "Family"],
    rating: 9.2,
    r2_image_path: "/api/movie/fantasticfox.jpg",
    r2_video_path: "api/movie/fantasticfox.mp4",
    r2_subtitles_path: "subtitles-fantasticfox.srt",
    description: "After 12 years of bucolic bliss, Mr. Fox (George Clooney) breaks a promise to his wife (Meryl Streep) and raids the farms of their human neighbors, Boggis, Bunce and Bean.",
    streamingUrl: "/api/stream/5"
  },
  {
    id: 6,
    title: "One Flew Over the Cuckoo's Nest",
    year: 1975,
    director: "Miloš Forman",
    genre: ["Drama"],
    rating: 9.2,
    r2_image_path: "/api/movie/cuckoosnest.jpg",
    r2_video_path: "api/movie/cuckoosnest.mp4",
    r2_subtitles_path: "subtitles-cuckoosnest.srt",
    description: "In the Fall of 1963, a Korean War veteran and criminal pleads insanity and is admitted to a mental institution, where he rallies up the scared patients against the tyrannical nurse.",
    streamingUrl: "/api/stream/6"
  }
  
];