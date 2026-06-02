import { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";
import { t } from "../i18n";

export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: t("errors.validation_failed"),
          details: (error as any).errors.map((e: any) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
};
