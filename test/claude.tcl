# Global variables
set ::globalVar1 "This is a global variable"
set ::globalVar2 42

# Namespace example
namespace eval MyNamespace {
    variable nsVar1 "Namespace variable"
    variable nsVar2 100
    
    # Procedure within namespace
    proc showValues {} {
        variable nsVar1
        variable nsVar2
        puts "Namespace variables: $nsVar1, $nsVar2"
        puts "Global variable: $::globalVar1"
        
        # Local variable
        set localVar "I'm local to showValues"
        puts "Local variable: $localVar"
    }
    
    # Nested procedure
    proc calculateSum {a b} {
        return [expr {$a + $b}]
    }
}

# Main procedures
proc main {} {
    # Local variables
    set localVar1 "Main local variable"
    set localVar2 [MyNamespace::calculateSum 10 20]
    
    # Using nested variable substitution
    set name "person"
    set person(age) 30
    set person(city) "New York"
    
    # This demonstrates nested variable substitution
    puts "The $name is $person(age) years old and lives in $person(city)"
    
    # Call namespace procedure
    MyNamespace::showValues
    
    # Using global variables
    puts "Global values: $::globalVar1, $::globalVar2"
}

# Array example
proc useArrays {} {
    array set fruits {
        apple "red"
        banana "yellow"
        grape "purple"
    }
    
    foreach {fruit color} [array get fruits] {
        puts "The $fruit is $color"
    }
    
    # Nested arrays and references
    set inventory(fruits,apple,count) 42
    set inventory(fruits,banana,count) 17
    
    set category "fruits"
    set item "apple"
    puts "We have $inventory($category,$item,count) apples"
}

# Execute main
main
useArrays