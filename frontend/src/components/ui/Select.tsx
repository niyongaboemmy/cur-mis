import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/helpers'

interface SelectOption {
  value: string | number
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?:            string
  error?:            string
  hint?:             string
  options:           SelectOption[]
  placeholder?:      string
  wrapperClassName?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className, wrapperClassName, id, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className={cn('w-full', wrapperClassName)}>
        {label && (
          <label htmlFor={selectId} className="label">
            {label}
            {props.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'input appearance-none pr-9',
              error && 'border-red-400 ring-1 ring-red-400 focus:border-red-400 focus:ring-red-400',
              className,
            )}
            aria-invalid={!!error}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
        {error && <p className="error-text">{error}</p>}
        {hint && !error && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      </div>
    )
  },
)

Select.displayName = 'Select'
export default Select
