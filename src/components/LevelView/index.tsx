import './index.scss';
import { useEffect, useRef, useState } from 'react';
import Association from '~/components/Association';
import type { Word } from '~/components/WordView/types';
import WordView from '~/components/WordView';
import { normalizeText } from '~/ts/helpers';
import { levelImportersById, levelMetadataById } from './helpers';
import type { Level, LevelData, LevelWords } from './types';

function generateLevelState(wordEntries: [string, Word][], savedData?: LevelData): LevelData {
  return Object.fromEntries(
    wordEntries.map(([wordId, wordData]) => [
      wordId,
      wordData.isStartup ? wordData.word
        : getCorrectSubstring(wordData, savedData?.[wordId] ?? '')
    ])
  );
}

function generateWordEntries(words: LevelWords): [string, Word][] {
  return Object.entries(words)
    .sort(([, dataA], [, dataB]) => dataA.y - dataB.y || dataA.x - dataB.x);
}

function getCorrectSubstring(wordData: Word, guess: string) {
  const normalizedGuess = normalizeText(guess);
  let lettersSolved = 0;

  if ([wordData.word]
    .concat(wordData.alternativeWords ?? [])
    .some(word => normalizedGuess.startsWith(normalizeText(word))) // TODO: Allow for some typos in full-word guesses
  ) {
    lettersSolved = wordData.word.length;
  } else if (!wordData.isBonus) {
    for (let guessPosition = 0; lettersSolved < wordData.word.length && guessPosition < normalizedGuess.length; lettersSolved++) {
      const normalizedChar = normalizeText(wordData.word[lettersSolved]);

      if (normalizedChar && normalizedGuess[guessPosition++] != normalizedChar) {
        break;
      }
    }
  }

  return wordData.word.substring(0, lettersSolved);
}

export default function LevelView(props: {
  disableHelpText?: boolean;
  levelId?: string;
  onLoad?: (success: boolean) => void;
  onSave: (savedData: LevelData) => void;
  savedData?: LevelData;
}) {
  const [level, setLevel] = useState<Level>();

  const loadingLevelIdRef = useRef('');

  const words = level?.words ?? {};
  const wordEntries = generateWordEntries(words);

  const [levelState, setLevelState] = useState(generateLevelState(wordEntries, props.savedData));

  const levelStateValues = Object.entries(levelState)
    .sort(([idA], [idB]) => idA < idB ? -1 : 1)
    .map(([, wordState]) => wordState);

  function guessWord(wordId: string, guess: string) {
    const wordData = words[wordId];

    if (wordIsSolved(wordId)) {
      (wordData.associations ?? [])
        .filter(otherWordId => !wordIsSolved(otherWordId))
        .forEach(otherWordId => guessWord(otherWordId, guess));
    } else {
      const correctSubstring = getCorrectSubstring(wordData, guess);

      setLevelState(state => correctSubstring > (state[wordId] ?? '') ? {
        ...state,
        [wordId]: correctSubstring
      } : state);
    }
  }

  function load() {
    if (props.levelId && levelImportersById[props.levelId]) {
      let success = true;

      loadingLevelIdRef.current = props.levelId;
      levelImportersById[props.levelId]()
        .then(module => module.default)
        .catch((): LevelWords => {
          success = false;

          return {};
        })
        .then((words) => {
          // Only set the level if the level ID hasn't changed since the import started
          if (props.levelId == loadingLevelIdRef.current) {
            setLevel({
              ...(levelMetadataById[props.levelId] ?? {}),
              words
            });
            setLevelState(generateLevelState(generateWordEntries(words), props.savedData));
            props.onLoad?.(success);
          }
        });
    } else {
      setLevel(undefined);
      props.onLoad?.(false);
    }
  }

  function save() {
    props.onSave(Object.fromEntries(
      Object.entries(levelState)
        .filter(([id, solution]) => solution && !words[id].isStartup)
    ));
  }

  function wordIsSolved(wordId: string) {
    return levelState[wordId].length >= words[wordId].word.length;
  }

  // Load new level if levelId changed
  useEffect(load, [props.levelId]);

  // Save if the level or any of the word states changed
  useEffect(save, [props.levelId, JSON.stringify(levelStateValues)]);

  return (
    <div className="LevelView">
      <div
        className="LevelView-container"
        style={{
          height: `${level?.height ?? 0}px`,
          width: `${level?.width ?? 0}px`
        }}
      >
        {wordEntries.map(([wordId, wordData]) =>
          (wordData.associations ?? [])
            .filter(otherWordId => wordId < otherWordId)
            .map(otherWordId => (
              <Association
                key={JSON.stringify([wordId, otherWordId])}
                word1Solved={wordIsSolved(wordId)}
                word2Solved={wordIsSolved(otherWordId)}
                x1={wordData.x}
                x2={words[otherWordId].x}
                y1={wordData.y}
                y2={words[otherWordId].y}
              />
            ))
        )}
        {wordEntries.map(([wordId, wordData]) => (
          <WordView
            hasSolvedAssociation={(wordData.associations ?? []).some(otherWordId => wordIsSolved(otherWordId))}
            helpText={props.disableHelpText ? undefined : wordData.helpText}
            isBonus={wordData.isBonus}
            key={wordId}
            lettersSolved={levelState[wordId].length}
            onGuess={guess => guessWord(wordId, guess)}
            word={wordData.word}
            x={wordData.x}
            y={wordData.y}
          />
        ))}
      </div>
    </div>
  );
}
