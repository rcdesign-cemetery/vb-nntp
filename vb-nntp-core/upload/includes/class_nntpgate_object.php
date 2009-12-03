<?php

abstract class NNTPGate_Object {

    /**
     *
     * @var vB_Database
     */
    protected $_db;

    /**
     * Конструктор
     *
     * @global vB_Registry $vbulletin
     * @param vB_Database $db
     */
    public function  __construct($db = null)
    {
        if (! is_null ($db))
        {
            $this->_db = $db;
        }
        else
        {
            global $vbulletin;
            $this->_db =& $vbulletin->db;
        }

    }

    /**
     * Используется при отладке, вместо var_dump/var_export, так как не выводит
     * состояние $_db
     * в $_db екземпляр класса vB_Database, а там много лишнего
     *
     * @return string
     */
    public function  __toString()
    {
        $result = '';
        $reflect = new ReflectionObject($this);
        foreach ($reflect->getProperties(ReflectionProperty::IS_PUBLIC + ReflectionProperty::IS_PROTECTED) as $prop)
        {
            $prop_name = $prop->getName();
            if ($prop_name != '_db')
            {
                $result .= $prop_name .'='.$this->$prop_name . "\n";
            }
        }
        return $result;
    }


}
