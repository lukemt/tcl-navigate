# TCL Test file for VS Code Extension
# This file tests symbol provider and definition provider functionality

# Global variables
set globalVar1 "I am a global variable"
set globalVar2 123
set globalList [list 1 2 3 4 5]

# Source external files
source utils.tcl
if {[file exists "helpers.tcl"]} {
    source helpers.tcl
}

# Basic procedure
proc simpleProc {} {
    puts "This is a simple procedure"
}

# Procedure with parameters
proc greet {name {greeting "Hello"}} {
    set message "$greeting, $name!"
    puts $message
    return $message
}

# Nested scopes with variable definitions
proc outerProc {param1} {
    set localVar1 "Outer local variable"
    set innerResult ""
    
    # Inner procedure with its own scope
    proc innerProc {param2} {
        global globalVar1
        set localVar2 "Inner local variable"
        
        # Nested scope within braces
        if {$param2 > 0} {
            set conditionalVar "Condition was true"
            puts $conditionalVar
        } else {
            set conditionalVar "Condition was false"
        }
        
        # Return a combination of variables to test scope
        return "$globalVar1 - $localVar2 - $conditionalVar"
    }
    
    # Call the inner procedure
    set innerResult [innerProc $param1]
    return "$localVar1 - $innerResult"
}

# Procedure with complex braces nesting
proc complexNesting {input} {
    set result {}
    
    # Multiple nested braces to test brace matching
    if {[string length $input] > 0} {
        foreach char [split $input ""] {
            if {[string is alpha $char]} {
                lappend result [string toupper $char]
            } elseif {[string is digit $char]} {
                lappend result [expr {$char * 2}]
            } else {
                lappend result \{$char\}
            }
        }
    }
    
    # Return with nested braces in the string
    return [join $result ""]
}

# Procedure that uses variables from different scopes
proc scopeTester {} {
    global globalVar1
    global globalVar2
    
    set localVar "Local scope"
    
    # Test accessing variables
    puts "Global: $globalVar1"
    puts "Local: $localVar"
    
    # Nested scope
    for {set i 0} {$i < 3} {incr i} {
        set loopVar "Loop iteration $i"
        
        # More nesting
        if {$i == 1} {
            set conditionalVar "This is iteration one"
        }
    }
    
    # Try to access variables from different scopes
    if {[info exists loopVar]} {
        puts "Loop variable: $loopVar"
    }
    
    if {[info exists conditionalVar]} {
        puts "Conditional variable: $conditionalVar"
    }
}

set jsonExample "rofl"

# Procedure with escaped braces
proc escapedBraces {} {
    set jsonExample "\{ \"name\": \"John\", \"age\": 30 \}"
    puts $jsonExample
    
    # Regexp with escaped braces
    set pattern {[\{\}]}
    if {[regexp $pattern $jsonExample]} {
        puts "Pattern matches!"
    }
    
    return $jsonExample
}

# Call various procedures
simpleProc
set greeting [greet "World"]
set nestedResult [outerProc 5]
set complex [complexNesting "a1b2c3!"]

# Define and call a procedure that uses the original example's function
proc callExternalFunc {input} {
    global globalVar1
    set hell "Modified string"
    
    # Call functions from your original example
    if {[info procs elo] eq "elo"} {
        elo
    }
    
    if {[info procs Hello] eq "Hello"} {
        Hello
    }
    
    # Test variables with the same name as in your original example
    set hell $input
    return $hell
}

# Call the function
set testResult [callExternalFunc "Test input"]
puts "Test result: $testResult"

# More global variables for testing Go To Definition
set finalTest "This is the final test variable"
puts $finalTest
puts $globalVar1