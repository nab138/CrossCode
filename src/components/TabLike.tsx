import { styled } from "@mui/joy/styles";
import { forwardRef, ButtonHTMLAttributes } from "react";

interface TabLikeProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  dragging?: boolean;
}

const TabLikeRoot = styled("button")<TabLikeProps>(
  ({ theme, selected, disabled, dragging }) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.25rem",
    position: "relative",
    boxSizing: "border-box",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "14px",
    minHeight: "24px !important",
    border: 0,
    outline: 0,
    background: "none",
    textDecoration: "none",
    ...theme.typography["title-sm"],
    fontWeight: selected ? theme.vars.fontWeight.md : theme.vars.fontWeight.sm,
    padding: "4px 8px",
    ...theme.variants.plain.neutral,
    "&:hover": !disabled ? theme.variants.plainHover.neutral : undefined,
    "&:active": !disabled ? theme.variants.plainActive.neutral : undefined,
    ...(selected && theme.variants.plainActive.neutral),
    ...(disabled && theme.variants.plainDisabled?.neutral),
    "&:focus-visible": {
      outline: `2px solid ${theme.vars.palette.focusVisible}`,
      outlineOffset: 2,
    },
    ...(dragging && {
      opacity: 0.6,
    }),
    transition: "background-color 120ms, color 120ms",
  })
);

export const TabLike = forwardRef<HTMLButtonElement, TabLikeProps>(
  ({ selected, dragging, ...rest }, ref) => {
    return (
      <TabLikeRoot
        ref={ref}
        selected={selected}
        dragging={dragging}
        {...rest}
      />
    );
  }
);
