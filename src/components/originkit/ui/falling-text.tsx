"use client";

import { useT } from "@/lib/i18n";

import * as React from "react";
import { useEffect, useCallback, useMemo } from "react";
import {
    motion,
    useAnimate,
    stagger as motionStagger,
    type Transition,
} from "framer-motion";

const TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "span"] as const;

type Font = {
    fontFamily?: string;
    variant?: string;
    fontWeight?: number;
    fontSize?: number;
    lineHeight?: number;
    letterSpacing?: string;
    textAlign?: React.CSSProperties["textAlign"];
};

type Props = {
    text?: string;
    font?: Font;
    color?: string;
    tag?: (typeof TAGS)[number];
    startY?: number;
    startOpacity?: number;
    stagger?: number;
    transition?: Transition;
    split?: "none" | "words" | "char";
};

export default function GravityFall({
    text = t("ui.gravity_fall"),
    font = {
        fontFamily: "Inter",
        variant: "Bold",
        fontWeight: 400,
        fontSize: 120,
        lineHeight: 1.2,
        letterSpacing: "0em",
        textAlign: "left",
    },
    color = "#FFFFFF",
    tag = "h3",
    startY = -1000,
    startOpacity = 0,
    stagger = 0.04,
    transition = { type: "spring", stiffness: 400, damping: 15, mass: 1 },
    split = "char",
}: Props) {
  const t = useT();
    const [scope, animate] = useAnimate();

    const normalizedOpacity = startOpacity / 100;

    const getTargetSelector = useCallback(() => {
        if (split === "none") return scope.current;
        if (split === "words") return ".word";
        return ".char";
    }, [split, scope]);

    const resetToHidden = useCallback(() => {
        if (!scope.current) return;
        const target = getTargetSelector();
        if (!target) return;
        animate(
            target,
            {
                y: startY,
                opacity: normalizedOpacity,
            },
            { duration: 0 }
        );
    }, [animate, scope, startY, normalizedOpacity, getTargetSelector]);

    const runAppear = useCallback(() => {
        if (!scope.current) return;
        const target = getTargetSelector();
        if (!target) return;

        const animationConfig = {
            ...transition,
            delay: split !== "none" ? motionStagger(stagger) : 0,
        };

        animate(
            target,
            {
                y: 0,
                opacity: 1,
            },
            animationConfig as any
        );
    }, [animate, transition, stagger, split, getTargetSelector]);

    useEffect(() => {
        resetToHidden();
        const t = setTimeout(runAppear, 50);
        return () => clearTimeout(t);
    }, [
        resetToHidden,
        runAppear,
        text,
        split,
        startY,
        stagger,
        JSON.stringify(transition),
    ]);

    const safeTag = (TAGS as readonly string[]).includes(tag) ? tag : "div";
    const Tag = (motion as any)[safeTag];

    const words = useMemo(() => text.split(/(\s+)/), [text]);

    const itemStyle: React.CSSProperties = {
        display: "inline-block",
        transformOrigin: "bottom center",
        verticalAlign: "bottom",
        willChange: "transform, opacity",
    };

    return (
        <Tag
            ref={scope}
            aria-label={text}
            style={{
                ...font,
                color,
                margin: 0,
                display: "inline-block",
                transformOrigin: "bottom center",
                verticalAlign: "bottom",
                overflow: "visible",
                willChange: split === "none" ? "transform, opacity" : undefined,
            }}
        >
            {split === "none" && text}

            {split === "words" &&
                words.map((word, wi) => {
                    if (word === "") return null;
                    if (/^\s+$/.test(word)) {
                        return (
                            <span
                                key={wi}
                                aria-hidden="true"
                                style={{ whiteSpace: "pre-wrap" }}
                            >
                                {word}
                            </span>
                        );
                    }
                    return (
                        <motion.span
                            key={wi}
                            className="word"
                            style={{
                                ...itemStyle,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {word}
                        </motion.span>
                    );
                })}

            {split === "char" &&
                words.map((word, wi) => {
                    if (word === "") return null;
                    if (/^\s+$/.test(word)) {
                        return (
                            <span
                                key={wi}
                                aria-hidden="true"
                                style={{ whiteSpace: "pre-wrap" }}
                            >
                                {word}
                            </span>
                        );
                    }
                    return (
                        <span
                            key={wi}
                            aria-hidden="true"
                            style={{
                                display: "inline-block",
                                whiteSpace: "nowrap",
                                verticalAlign: "bottom",
                            }}
                        >
                            {Array.from(word).map((char, ci) => (
                                <motion.span
                                    key={ci}
                                    className="char"
                                    style={itemStyle}
                                >
                                    {char}
                                </motion.span>
                            ))}
                        </span>
                    );
                })}
        </Tag>
    );
}